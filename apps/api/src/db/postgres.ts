import pg from 'pg';
import type { Alias, ResolveResult } from '@wdmbg/contracts';
import { isLocalAddress } from '@wdmbg/contracts';
import type { LabelLookup } from '../traffic/aggregate.js';
import type { MetaStore } from '../meta/store.js';
import dns from 'node:dns/promises';

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
  private readonly ptrEnabled: boolean;
  private memAlias = new Map<string, string>();
  private memCountry = new Map<string, string>();

  constructor(
    private readonly pool: pg.Pool,
    opts?: { cacheTtlMs?: number; ptrEnabled?: boolean },
  ) {
    this.cacheTtlMs = opts?.cacheTtlMs ?? 60 * 60 * 1000;
    this.ptrEnabled = opts?.ptrEnabled ?? true;
  }

  async warm(): Promise<void> {
    const aliases = await this.pool.query<{ host: string; alias: string }>(
      'SELECT host, alias FROM aliases',
    );
    this.memAlias.clear();
    for (const row of aliases.rows) {
      this.memAlias.set(row.host, row.alias);
    }
    const countries = await this.pool.query<{ host: string; country: string }>(
      `SELECT host, country FROM lookup_cache WHERE expires_at > NOW()`,
    );
    this.memCountry.clear();
    for (const row of countries.rows) {
      this.memCountry.set(row.host, row.country);
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

  asLabelLookup(): LabelLookup {
    return {
      getLabel: (host) => this.getAlias(host),
      getCountry: (host) => this.getCountry(host),
    };
  }

  async resolve(hosts: string[]): Promise<ResolveResult[]> {
    const results: ResolveResult[] = [];
    for (const host of hosts) {
      const alias = this.getAlias(host);
      if (alias) {
        results.push({ host, hostname: alias, source: 'alias' });
        continue;
      }

      const cached = await this.pool.query<{
        hostname: string | null;
        expires_at: Date;
      }>(`SELECT hostname, expires_at FROM lookup_cache WHERE host = $1`, [host]);
      const row = cached.rows[0];
      if (row && row.expires_at.getTime() > Date.now()) {
        results.push({
          host,
          hostname: row.hostname,
          source: row.hostname ? 'cache' : 'none',
        });
        continue;
      }

      if (!this.ptrEnabled) {
        results.push({ host, hostname: null, source: 'none' });
        continue;
      }

      let hostname: string | null = null;
      try {
        const names = await dns.reverse(host);
        hostname = names[0] ?? null;
      } catch {
        hostname = null;
      }

      const country = this.getCountry(host);
      const expires = new Date(Date.now() + this.cacheTtlMs);
      await this.pool.query(
        `INSERT INTO lookup_cache (host, hostname, country, asn, source, expires_at, updated_at)
         VALUES ($1, $2, $3, NULL, 'ptr', $4, NOW())
         ON CONFLICT (host) DO UPDATE SET
           hostname = EXCLUDED.hostname,
           country = EXCLUDED.country,
           source = EXCLUDED.source,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()`,
        [host, hostname, country, expires],
      );
      this.memCountry.set(host, country);
      results.push({
        host,
        hostname,
        source: hostname ? 'ptr' : 'none',
      });
    }
    return results;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
