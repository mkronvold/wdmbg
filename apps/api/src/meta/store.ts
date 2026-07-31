import { isLocalAddress, type Alias, type ResolveResult } from '@wdmbg/contracts';
import type { LabelLookup } from '../traffic/aggregate.js';
import dns from 'node:dns/promises';

export interface LookupCacheEntry {
  host: string;
  hostname: string | null;
  country: string;
  asn: string | null;
  source: 'ptr' | 'geo' | 'manual';
  expiresAt: number;
}

export interface MetaStore {
  getAlias(host: string): string | undefined;
  setAlias(host: string, alias: string): Promise<Alias>;
  listAliases(): Alias[];
  resolve(hosts: string[]): Promise<ResolveResult[]>;
  asLabelLookup(): LabelLookup;
  close(): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** In-memory metadata (Phase 3 default; Phase 5 may wrap Postgres). */
export class MemoryMetaStore implements MetaStore {
  private aliases = new Map<string, Alias>();
  private lookupCache = new Map<string, LookupCacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly ptrEnabled: boolean;
  private readonly countryByIp: Map<string, string>;

  constructor(opts?: {
    cacheTtlMs?: number;
    ptrEnabled?: boolean;
    countryByIp?: Map<string, string>;
  }) {
    this.cacheTtlMs = opts?.cacheTtlMs ?? 60 * 60 * 1000;
    this.ptrEnabled = opts?.ptrEnabled ?? true;
    this.countryByIp = opts?.countryByIp ?? new Map();
  }

  getAlias(host: string): string | undefined {
    return this.aliases.get(host)?.alias;
  }

  async setAlias(host: string, alias: string): Promise<Alias> {
    const row: Alias = { host, alias, updatedAt: nowIso() };
    this.aliases.set(host, row);
    return row;
  }

  listAliases(): Alias[] {
    return [...this.aliases.values()];
  }

  getCountry(host: string): string {
    if (isLocalAddress(host)) return 'Local';
    const cached = this.lookupCache.get(host);
    if (cached && cached.expiresAt > Date.now() && cached.country) {
      return cached.country;
    }
    return this.countryByIp.get(host) ?? 'Unknown';
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

      const cached = this.lookupCache.get(host);
      if (cached && cached.expiresAt > Date.now()) {
        results.push({
          host,
          hostname: cached.hostname,
          source: cached.hostname ? 'cache' : 'none',
        });
        continue;
      }

      if (!this.ptrEnabled) {
        results.push({ host, hostname: null, source: 'none' });
        continue;
      }

      try {
        const names = await dns.reverse(host);
        const hostname = names[0] ?? null;
        this.lookupCache.set(host, {
          host,
          hostname,
          country: this.getCountry(host),
          asn: null,
          source: 'ptr',
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        results.push({
          host,
          hostname,
          source: hostname ? 'ptr' : 'none',
        });
      } catch {
        this.lookupCache.set(host, {
          host,
          hostname: null,
          country: this.getCountry(host),
          asn: null,
          source: 'ptr',
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        results.push({ host, hostname: null, source: 'none' });
      }
    }
    return results;
  }

  async close(): Promise<void> {
    // no-op
  }

  /** Test helper: seed PTR/geo cache without DNS. */
  seedLookup(entry: LookupCacheEntry): void {
    this.lookupCache.set(entry.host, entry);
  }
}
