import {
  isLocalAddress,
  type Alias,
  type ResolveResult,
  type ResolveSource,
} from '@wdmbg/contracts';
import type { LabelLookup } from '../traffic/aggregate.js';
import type { AdGuardNameProvider } from '../adguard/resolver.js';
import dns from 'node:dns/promises';

export type LookupCacheSource =
  'ptr' | 'geo' | 'manual' | 'adguard-rewrite' | 'adguard-dhcp' | 'adguard-client';

export interface LookupCacheEntry {
  host: string;
  hostname: string | null;
  country: string;
  asn: string | null;
  source: LookupCacheSource;
  expiresAt: number;
}

export interface MetaStore {
  getAlias(host: string): string | undefined;
  setAlias(host: string, alias: string): Promise<Alias>;
  /** Remove persistent alias for host (no-op if missing). */
  clearAlias(host: string): Promise<boolean>;
  /** Drop lookup_cache entry so resolved names can refresh. */
  clearCache(host: string): Promise<boolean>;
  listAliases(): Alias[];
  resolve(hosts: string[]): Promise<ResolveResult[]>;
  asLabelLookup(): LabelLookup;
  close(): Promise<void>;
}

export interface MetaStoreResolveDeps {
  ptrEnabled: boolean;
  /** TTL for PTR (and negative) cache entries. */
  cacheTtlMs: number;
  /** TTL for successful AdGuard cache entries. */
  adguardCacheTtlMs: number;
  adguard?: AdGuardNameProvider | null;
  getCountry: (host: string) => string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cacheSourceToResolve(source: LookupCacheSource, hostname: string | null): ResolveSource {
  if (!hostname) return 'none';
  if (
    source === 'adguard-rewrite' ||
    source === 'adguard-dhcp' ||
    source === 'adguard-client' ||
    source === 'ptr'
  ) {
    return source;
  }
  return 'cache';
}

/**
 * Shared resolve chain:
 * alias → lookup_cache → AdGuard (rewrite → dhcp → client) → PTR → none
 */
export async function resolveHosts(
  hosts: string[],
  deps: MetaStoreResolveDeps & {
    getAlias: (host: string) => string | undefined;
    readCache: (host: string) => Promise<LookupCacheEntry | null> | LookupCacheEntry | null;
    writeCache: (entry: LookupCacheEntry) => Promise<void> | void;
  },
): Promise<ResolveResult[]> {
  const results: ResolveResult[] = [];
  for (const host of hosts) {
    const alias = deps.getAlias(host);
    if (alias) {
      results.push({ host, hostname: alias, source: 'alias' });
      continue;
    }

    const cached = await deps.readCache(host);
    if (cached && cached.expiresAt > Date.now()) {
      results.push({
        host,
        hostname: cached.hostname,
        source: cacheSourceToResolve(cached.source, cached.hostname),
      });
      continue;
    }

    const ag = deps.adguard;
    if (ag) {
      try {
        const hit = await ag.lookup(host);
        if (hit) {
          const entry: LookupCacheEntry = {
            host,
            hostname: hit.hostname,
            country: deps.getCountry(host),
            asn: null,
            source: hit.source,
            expiresAt: Date.now() + deps.adguardCacheTtlMs,
          };
          await deps.writeCache(entry);
          results.push({ host, hostname: hit.hostname, source: hit.source });
          continue;
        }
      } catch {
        // AdGuard optional — fall through to PTR
      }
    }

    if (!deps.ptrEnabled) {
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

    const entry: LookupCacheEntry = {
      host,
      hostname,
      country: deps.getCountry(host),
      asn: null,
      source: 'ptr',
      expiresAt: Date.now() + deps.cacheTtlMs,
    };
    await deps.writeCache(entry);
    results.push({
      host,
      hostname,
      source: hostname ? 'ptr' : 'none',
    });
  }
  return results;
}

/** In-memory metadata (Phase 3 default; Phase 5 may wrap Postgres). */
export class MemoryMetaStore implements MetaStore {
  private aliases = new Map<string, Alias>();
  private lookupCache = new Map<string, LookupCacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly adguardCacheTtlMs: number;
  private readonly ptrEnabled: boolean;
  private readonly countryByIp: Map<string, string>;
  private readonly adguard: AdGuardNameProvider | null;

  constructor(opts?: {
    cacheTtlMs?: number;
    adguardCacheTtlMs?: number;
    ptrEnabled?: boolean;
    countryByIp?: Map<string, string>;
    adguard?: AdGuardNameProvider | null;
  }) {
    this.cacheTtlMs = opts?.cacheTtlMs ?? 60 * 60 * 1000;
    this.adguardCacheTtlMs = opts?.adguardCacheTtlMs ?? 10 * 60 * 1000;
    this.ptrEnabled = opts?.ptrEnabled ?? true;
    this.countryByIp = opts?.countryByIp ?? new Map();
    this.adguard = opts?.adguard ?? null;
  }

  getAlias(host: string): string | undefined {
    return this.aliases.get(host)?.alias;
  }

  async setAlias(host: string, alias: string): Promise<Alias> {
    const row: Alias = { host, alias, updatedAt: nowIso() };
    this.aliases.set(host, row);
    return row;
  }

  async clearAlias(host: string): Promise<boolean> {
    return this.aliases.delete(host);
  }

  async clearCache(host: string): Promise<boolean> {
    return this.lookupCache.delete(host);
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

  private getCachedHostname(host: string): string | undefined {
    const cached = this.lookupCache.get(host);
    if (cached && cached.expiresAt > Date.now() && cached.hostname) {
      return cached.hostname;
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
      readCache: (h) => this.lookupCache.get(h) ?? null,
      writeCache: (entry) => {
        this.lookupCache.set(entry.host, entry);
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
  }

  /** Test helper: seed PTR/geo/AdGuard cache without DNS. */
  seedLookup(entry: LookupCacheEntry): void {
    this.lookupCache.set(entry.host, entry);
  }
}
