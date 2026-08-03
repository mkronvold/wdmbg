import {
  aliasSchema,
  dashboardSchema,
  healthSchema,
  hostFlowsSchema,
  hostSummarySchema,
  resolveResponseSchema,
  type Alias,
  type Dashboard,
  type Health,
  type HostFlows,
  type HostSummary,
  type QueryWindow,
  type ResolveResponse,
} from '@wdmbg/contracts';

async function getJson<T>(url: string, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status}`);
  }
  return parse(await response.json());
}

function withExcludeLocal(url: string, excludeLocal?: boolean): string {
  if (!excludeLocal) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}excludeLocal=1`;
}

export function fetchHealth(): Promise<Health> {
  return getJson('/api/health', (d) => healthSchema.parse(d));
}

export function fetchDashboard(window: QueryWindow, excludeLocal = false): Promise<Dashboard> {
  return getJson(withExcludeLocal(`/api/dashboard?window=${window}`, excludeLocal), (d) =>
    dashboardSchema.parse(d),
  );
}

export function fetchHost(
  host: string,
  window: QueryWindow,
  excludeLocal = false,
): Promise<HostSummary> {
  return getJson(
    withExcludeLocal(`/api/hosts/${encodeURIComponent(host)}?window=${window}`, excludeLocal),
    (d) => hostSummarySchema.parse(d),
  );
}

export function fetchHostFlows(
  host: string,
  window: QueryWindow,
  excludeLocal = false,
): Promise<HostFlows> {
  return getJson(
    withExcludeLocal(`/api/hosts/${encodeURIComponent(host)}/flows?window=${window}`, excludeLocal),
    (d) => hostFlowsSchema.parse(d),
  );
}

export async function putAlias(host: string, alias: string): Promise<Alias> {
  const response = await fetch('/api/alias', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, alias }),
  });
  if (!response.ok) {
    throw new Error(`alias failed: ${response.status}`);
  }
  return aliasSchema.parse(await response.json());
}

export async function clearAlias(host: string): Promise<{ ok: boolean; host: string }> {
  const response = await fetch(`/api/alias?host=${encodeURIComponent(host)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`clear alias failed: ${response.status}`);
  }
  return (await response.json()) as { ok: boolean; host: string };
}

export async function resolveHosts(hosts: string[]): Promise<ResolveResponse> {
  const response = await fetch('/api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hosts }),
  });
  if (!response.ok) {
    throw new Error(`resolve failed: ${response.status}`);
  }
  return resolveResponseSchema.parse(await response.json());
}

export function liveWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/live`;
}
