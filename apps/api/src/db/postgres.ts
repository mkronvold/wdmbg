import pg from 'pg';
import type { Alias, ResolveResult } from '@wdmbg/contracts';
import { isLocalAddress } from '@wdmbg/contracts';
import type { LabelLookup } from '../traffic/aggregate.js';
import {
  resolveHosts,
  type LookupCacheEntry,
  type LookupCacheSource,
  type MetaStore,
} from '../meta/store.js';
import type { AdGuardNameProvider } from '../adguard/resolver.js';

const { Pool } = pg;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS aliases (
  host TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lookup_cache (
  host TEXT PRIMARY KEY,
  hostname TEXT,
  country TEXT NOT NULL DEFAULT 'Unknown',
  asn TEXT,
  source TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function createPool(databaseUrl: string): Promise<pg.Pool> {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query(SCHEMA_SQL);
  return pool;
}

export class PostgresMetaStore implements MetaStore {
  private readonly cacheTtlMs: number;
  private readonly adguardCacheTtlMs: number;
  private readonly ptrEnabled: boolean;
  private readonly adguard: AdGuardNameProvider | null;
  private memAlias = new Map<string, string>();
  private memCountry = new Map<string, string>();
  private memHostname = new Map<string, { hostname: string; expiresAt: number }>();

  constructor(
    private readonly pool: pg.Pool,
    opts?: {
      cacheTtlMs?: number;
      adguardCacheTtlMs?: number;
      ptrEnabled?: boolean;
      adguard?: AdGuardNameProvider | null;
    },
  ) {
    this.cacheTtlMs = opts?.cacheTtlMs ?? 60 * 60 * 1000;
    this.adguardCacheTtlMs = opts?.adguardCacheTtlMs ?? 10 * 60 * 1000;
    this.ptrEnabled = opts?.ptrEnabled ?? true;
    this.adguard = opts?.adguard ?? null;
  }

  async warm(): Promise<void> {
    const aliases = await this.pool.query<{ host: string; alias: string }>(
      'SELECT host, alias FROM aliases',
    );
    this.memAlias.clear();
    for (const row of aliases.rows) {
      this.memAlias.set(row.host, row.alias);
    }
    const cacheRows = await this.pool.query<{
      host: string;
      country: string;
      hostname: string | null;
      expires_at: Date;
    }>(`SELECT host, country, hostname, expires_at FROM lookup_cache WHERE expires_at > NOW()`);
    this.memCountry.clear();
    this.memHostname.clear();
    for (const row of cacheRows.rows) {
      this.memCountry.set(row.host, row.country);
      if (row.hostname) {
        this.memHostname.set(row.host, {
          hostname: row.hostname,
          expiresAt: row.expires_at.getTime(),
        });
      }
    }
  }

  getAlias(host: string): string | undefined {
    return this.memAlias.get(host);
  }

  async setAlias(host: string, alias: string): Promise<Alias> {
    const result = await this.pool.query<{ host: string; alias: string; updated_at: Date }>(
      `INSERT INTO aliases (host, alias, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (host) DO UPDATE SET alias = EXCLUDED.alias, updated_at = NOW()
       RETURNING host, alias, updated_at`,
      [host, alias],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('alias upsert failed');
    }
    this.memAlias.set(host, alias);
    return {
      host: row.host,
      alias: row.alias,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  listAliases(): Alias[] {
    return [...this.memAlias.entries()].map(([host, alias]) => ({
      host,
      alias,
      updatedAt: new Date().toISOString(),
    }));
  }

  getCountry(host: string): string {
    if (isLocalAddress(host)) return 'Local';
    return this.memCountry.get(host) ?? 'Unknown';
  }

  private getCachedHostname(host: string): string | undefined {
    const mem = this.memHostname.get(host);
    if (mem && mem.expiresAt > Date.now()) {
      return mem.hostname;
    }
    return undefined;
  }

  asLabelLookup(): LabelLookup {
    return {
      getLabel: (host) => this.getAlias(host) ?? this.getCachedHostname(host),
      getCountry: (host) => this.getCountry(host),
    };
  }

  async resolve(hosts: string[]): Promise<ResolveResult[]> {
    return resolveHosts(hosts, {
      getAlias: (h) => this.getAlias(h),
      readCache: async (host) => {
        const cached = await this.pool.query<{
          hostname: string | null;
          country: string;
          asn: string | null;
          source: string;
          expires_at: Date;
        }>(`SELECT hostname, country, asn, source, expires_at FROM lookup_cache WHERE host = $1`, [
          host,
        ]);
        const row = cached.rows[0];
        if (!row) return null;
        return {
          host,
          hostname: row.hostname,
          country: row.country,
          asn: row.asn,
          source: row.source as LookupCacheSource,
          expiresAt: row.expires_at.getTime(),
        };
      },
      writeCache: async (entry: LookupCacheEntry) => {
        const expires = new Date(entry.expiresAt);
        await this.pool.query(
          `INSERT INTO lookup_cache (host, hostname, country, asn, source, expires_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (host) DO UPDATE SET
             hostname = EXCLUDED.hostname,
             country = EXCLUDED.country,
             asn = EXCLUDED.asn,
             source = EXCLUDED.source,
             expires_at = EXCLUDED.expires_at,
             updated_at = NOW()`,
          [entry.host, entry.hostname, entry.country, entry.asn, entry.source, expires],
        );
        this.memCountry.set(entry.host, entry.country);
        if (entry.hostname) {
          this.memHostname.set(entry.host, {
            hostname: entry.hostname,
            expiresAt: entry.expiresAt,
          });
        } else {
          this.memHostname.delete(entry.host);
        }
      },
      getCountry: (h) => this.getCountry(h),
      ptrEnabled: this.ptrEnabled,
      cacheTtlMs: this.cacheTtlMs,
      adguardCacheTtlMs: this.adguardCacheTtlMs,
      adguard: this.adguard,
    });
  }

  async close(): Promise<void> {
    this.adguard?.close();
    await this.pool.end();
  }
}
