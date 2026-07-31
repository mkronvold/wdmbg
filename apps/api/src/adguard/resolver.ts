import type { ResolveSource } from '@wdmbg/contracts';
import { AdGuardClient, looksLikeIp, pickStableName, type AdGuardClientOptions } from './client.js';

export type AdGuardResolveSource = Extract<
  ResolveSource,
  'adguard-rewrite' | 'adguard-dhcp' | 'adguard-client'
>;

export interface AdGuardHit {
  hostname: string;
  source: AdGuardResolveSource;
}

export interface AdGuardNameProvider {
  /** Resolve IP → hostname via rewrite → dhcp → client. Null if disabled/down/miss. */
  lookup(ip: string): Promise<AdGuardHit | null>;
  /** Stop background refresh. */
  close(): void;
}

export interface AdGuardNameResolverOptions {
  client: AdGuardClient;
  /** How often to refresh maps (default 5 min). */
  refreshMs?: number;
  /** If true, refresh immediately on construct (default false — lazy). */
  warmOnStart?: boolean;
  logger?: { warn: (msg: string) => void };
}

/**
 * Caches inverted AdGuard maps and answers lookups without per-request stampede.
 * Failures leave maps empty/stale and lookup returns null (caller falls through to PTR).
 */
export class AdGuardNameResolver implements AdGuardNameProvider {
  private readonly client: AdGuardClient;
  private readonly refreshMs: number;
  private readonly logger?: { warn: (msg: string) => void };

  private rewriteByIp = new Map<string, string>();
  private dhcpByIp = new Map<string, string>();
  private clientByIp = new Map<string, string>();

  private lastRefreshAt = 0;
  private refreshPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(opts: AdGuardNameResolverOptions) {
    this.client = opts.client;
    this.refreshMs = opts.refreshMs ?? 5 * 60 * 1000;
    if (opts.logger) {
      this.logger = opts.logger;
    }

    if (this.refreshMs > 0) {
      this.timer = setInterval(() => {
        void this.refresh().catch(() => {
          /* logged inside */
        });
      }, this.refreshMs);
      // Allow process to exit without waiting on the timer (Node).
      this.timer.unref?.();
    }

    if (opts.warmOnStart) {
      void this.refresh().catch(() => {
        /* logged inside */
      });
    }
  }

  async lookup(ip: string): Promise<AdGuardHit | null> {
    if (this.closed) return null;
    await this.ensureFresh();

    const rewrite = this.rewriteByIp.get(ip);
    if (rewrite) return { hostname: rewrite, source: 'adguard-rewrite' };

    const dhcp = this.dhcpByIp.get(ip);
    if (dhcp) return { hostname: dhcp, source: 'adguard-dhcp' };

    const client = this.clientByIp.get(ip);
    if (client) return { hostname: client, source: 'adguard-client' };

    return null;
  }

  close(): void {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Test helper: inspect current maps. */
  snapshot(): {
    rewriteByIp: Map<string, string>;
    dhcpByIp: Map<string, string>;
    clientByIp: Map<string, string>;
  } {
    return {
      rewriteByIp: new Map(this.rewriteByIp),
      dhcpByIp: new Map(this.dhcpByIp),
      clientByIp: new Map(this.clientByIp),
    };
  }

  private async ensureFresh(): Promise<void> {
    if (this.lastRefreshAt > 0 && Date.now() - this.lastRefreshAt < this.refreshMs) {
      return;
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.closed) return;
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }
    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    const rewriteNames = new Map<string, string[]>();
    const dhcpNames = new Map<string, string[]>();
    const clientNames = new Map<string, string[]>();

    const tasks: Promise<void>[] = [
      this.client
        .listRewrites()
        .then((list) => {
          for (const entry of list) {
            if (entry.enabled === false) continue;
            if (!looksLikeIp(entry.answer)) continue;
            pushName(rewriteNames, entry.answer, entry.domain);
          }
        })
        .catch((err: unknown) => {
          this.logger?.warn(`AdGuard rewrites refresh failed: ${errorMessage(err)}`);
        }),
      this.client
        .dhcpStatus()
        .then((status) => {
          for (const lease of [...status.leases, ...status.staticLeases]) {
            if (!lease.ip || !lease.hostname) continue;
            pushName(dhcpNames, lease.ip, lease.hostname);
          }
        })
        .catch((err: unknown) => {
          this.logger?.warn(`AdGuard DHCP refresh failed: ${errorMessage(err)}`);
        }),
      this.client
        .listClients()
        .then((res) => {
          for (const c of res.clients) {
            for (const id of c.ids) {
              if (looksLikeIp(id)) {
                pushName(clientNames, id, c.name);
              }
            }
          }
          for (const c of res.autoClients) {
            if (c.ip && c.name) {
              pushName(clientNames, c.ip, c.name);
            }
          }
        })
        .catch((err: unknown) => {
          this.logger?.warn(`AdGuard clients refresh failed: ${errorMessage(err)}`);
        }),
    ];

    await Promise.all(tasks);

    this.rewriteByIp = finalizeMap(rewriteNames);
    this.dhcpByIp = finalizeMap(dhcpNames);
    this.clientByIp = finalizeMap(clientNames);
    this.lastRefreshAt = Date.now();
  }
}

function pushName(map: Map<string, string[]>, ip: string, name: string): void {
  const list = map.get(ip);
  if (list) {
    list.push(name);
  } else {
    map.set(ip, [name]);
  }
}

function finalizeMap(names: Map<string, string[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ip, list] of names) {
    const picked = pickStableName(list);
    if (picked) out.set(ip, picked);
  }
  return out;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface AdGuardEnvConfig {
  enabled: boolean;
  baseUrl?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
  refreshMs: number;
  /** TTL for successful AdGuard hits written to lookup_cache. */
  cacheTtlMs: number;
}

export function adguardConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AdGuardEnvConfig {
  const baseUrl = env.WDMBG_ADGUARD_URL?.trim() || undefined;
  const enabledFlag = env.WDMBG_ADGUARD_ENABLED;
  const enabled = Boolean(baseUrl) && enabledFlag !== '0' && enabledFlag?.toLowerCase() !== 'false';

  const config: AdGuardEnvConfig = {
    enabled,
    timeoutMs: parsePositiveInt(env.WDMBG_ADGUARD_TIMEOUT_MS, 1500),
    refreshMs: parsePositiveInt(env.WDMBG_ADGUARD_REFRESH_MS, 5 * 60 * 1000),
    cacheTtlMs: parsePositiveInt(env.WDMBG_ADGUARD_CACHE_TTL_MS, 10 * 60 * 1000),
  };
  if (baseUrl) config.baseUrl = baseUrl;
  const username = env.WDMBG_ADGUARD_USER?.trim();
  if (username) config.username = username;
  if (env.WDMBG_ADGUARD_PASSWORD !== undefined) {
    config.password = env.WDMBG_ADGUARD_PASSWORD;
  }
  return config;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function createAdGuardNameProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<AdGuardClientOptions> & {
    refreshMs?: number;
    warmOnStart?: boolean;
    logger?: { warn: (msg: string) => void };
  },
): { provider: AdGuardNameProvider | null; config: AdGuardEnvConfig } {
  const config = adguardConfigFromEnv(env);
  if (!config.enabled || !config.baseUrl) {
    return { provider: null, config };
  }

  const clientOpts: AdGuardClientOptions = {
    baseUrl: config.baseUrl,
    timeoutMs: overrides?.timeoutMs ?? config.timeoutMs,
  };
  if (config.username !== undefined) clientOpts.username = config.username;
  if (config.password !== undefined) clientOpts.password = config.password;
  if (overrides?.fetchImpl) clientOpts.fetchImpl = overrides.fetchImpl;

  const client = new AdGuardClient(clientOpts);

  const resolverOpts: AdGuardNameResolverOptions = {
    client,
    refreshMs: overrides?.refreshMs ?? config.refreshMs,
    warmOnStart: overrides?.warmOnStart ?? true,
  };
  if (overrides?.logger) resolverOpts.logger = overrides.logger;

  const provider = new AdGuardNameResolver(resolverOpts);

  return { provider, config };
}
