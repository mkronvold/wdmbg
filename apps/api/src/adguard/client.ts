/** Minimal AdGuard Home control API client (HTTP basic auth). Never logs secrets. */

export interface AdGuardClientOptions {
  baseUrl: string;
  username?: string;
  password?: string;
  /** Per-request timeout in ms (default 1500). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface AdGuardRewrite {
  domain: string;
  answer: string;
  enabled?: boolean;
}

export interface AdGuardDhcpLease {
  ip: string;
  hostname: string;
  mac?: string;
}

export interface AdGuardPersistentClient {
  name: string;
  ids: string[];
}

export interface AdGuardAutoClient {
  ip: string;
  name: string;
  source?: string;
}

export interface AdGuardClientsResponse {
  clients: AdGuardPersistentClient[];
  autoClients: AdGuardAutoClient[];
}

export class AdGuardClient {
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AdGuardClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (opts.username !== undefined && opts.username !== '') {
      const token = Buffer.from(`${opts.username}:${opts.password ?? ''}`, 'utf8').toString(
        'base64',
      );
      this.authHeader = `Basic ${token}`;
    }
  }

  async listRewrites(): Promise<AdGuardRewrite[]> {
    const raw = await this.getJson<unknown>('/control/rewrite/list');
    return parseRewrites(raw);
  }

  async dhcpStatus(): Promise<{ leases: AdGuardDhcpLease[]; staticLeases: AdGuardDhcpLease[] }> {
    const raw = await this.getJson<unknown>('/control/dhcp/status');
    return parseDhcpStatus(raw);
  }

  async listClients(): Promise<AdGuardClientsResponse> {
    const raw = await this.getJson<unknown>('/control/clients');
    return parseClients(raw);
  }

  private async getJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.authHeader) {
        headers.Authorization = this.authHeader;
      }
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`AdGuard ${path} failed: HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Prefer IPv4/IPv6 literals for answer→IP maps. */
export function looksLikeIp(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  if (value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)) return true;
  return false;
}

export function parseRewrites(raw: unknown): AdGuardRewrite[] {
  if (!Array.isArray(raw)) return [];
  const out: AdGuardRewrite[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const domain = asString(item.domain);
    const answer = asString(item.answer);
    if (!domain || !answer) continue;
    const enabled = item.enabled === undefined ? true : Boolean(item.enabled);
    out.push({ domain, answer, enabled });
  }
  return out;
}

export function parseDhcpStatus(raw: unknown): {
  leases: AdGuardDhcpLease[];
  staticLeases: AdGuardDhcpLease[];
} {
  if (!isRecord(raw)) {
    return { leases: [], staticLeases: [] };
  }
  return {
    leases: parseLeaseArray(raw.leases),
    staticLeases: parseLeaseArray(raw.static_leases ?? raw.staticLeases),
  };
}

function parseLeaseArray(raw: unknown): AdGuardDhcpLease[] {
  if (!Array.isArray(raw)) return [];
  const out: AdGuardDhcpLease[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const ip = asString(item.ip) ?? asString(item.IP) ?? asString(item.ip_address);
    const hostname =
      asString(item.hostname) ??
      asString(item.host_name) ??
      asString(item.name) ??
      asString(item.HostName);
    if (!ip || !hostname) continue;
    const mac = asString(item.mac) ?? asString(item.MAC);
    out.push(mac ? { ip, hostname, mac } : { ip, hostname });
  }
  return out;
}

export function parseClients(raw: unknown): AdGuardClientsResponse {
  if (!isRecord(raw)) {
    return { clients: [], autoClients: [] };
  }
  const clients: AdGuardPersistentClient[] = [];
  const clientList = raw.clients;
  if (Array.isArray(clientList)) {
    for (const item of clientList) {
      if (!isRecord(item)) continue;
      const name = asString(item.name);
      const idsRaw = item.ids;
      if (!name || !Array.isArray(idsRaw)) continue;
      const ids = idsRaw.map(asString).filter((x): x is string => x !== undefined);
      if (ids.length === 0) continue;
      clients.push({ name, ids });
    }
  }

  const autoClients: AdGuardAutoClient[] = [];
  const autoList = raw.auto_clients ?? raw.autoClients;
  if (Array.isArray(autoList)) {
    for (const item of autoList) {
      if (!isRecord(item)) continue;
      const ip = asString(item.ip);
      const name = asString(item.name);
      if (!ip || !name) continue;
      const source = asString(item.source);
      autoClients.push(source ? { ip, name, source } : { ip, name });
    }
  }

  return { clients, autoClients };
}

/** Stable pick when multiple names map to one IP: shortest, then lexicographic. */
export function pickStableName(names: Iterable<string>): string | undefined {
  let best: string | undefined;
  for (const name of names) {
    const n = name.trim();
    if (!n) continue;
    if (
      best === undefined ||
      n.length < best.length ||
      (n.length === best.length && n.localeCompare(best) < 0)
    ) {
      best = n;
    }
  }
  return best;
}
