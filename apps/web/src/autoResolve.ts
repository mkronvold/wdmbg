import type { Dashboard, FlowRow, HostFlows, HostSummary, TalkerRow } from '@wdmbg/contracts';
import { resolveHosts } from './api/client';

export const RESOLVE_NAME_KEY = 'wdmbg.resolveName';
export type ResolveNameMode = 'disabled' | 'auto';

const BATCH_SIZE = 40;
const DEBOUNCE_MS = 600;
const ERROR_BACKOFF_MS = 5_000;
/** Skip re-resolve after miss/error; allow retry after TTL so labels can recover when server cache expires. */
export const NEGATIVE_CACHE_TTL_MS = 12 * 60 * 1000;

/** Session-scoped negative cache: IP → retry-after timestamp (miss or error). */
const negativeCache = new Map<string, number>();
const inFlightIps = new Set<string>();

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let pendingIps = new Set<string>();
let backoffUntil = 0;
let resolveChain: Promise<void> = Promise.resolve();

export function loadResolveNameMode(): ResolveNameMode {
  try {
    const raw = localStorage.getItem(RESOLVE_NAME_KEY);
    if (raw === 'auto' || raw === 'disabled') return raw;
  } catch {
    // ignore
  }
  return 'disabled';
}

export function saveResolveNameMode(mode: ResolveNameMode) {
  try {
    localStorage.setItem(RESOLVE_NAME_KEY, mode);
  } catch {
    // ignore
  }
}

export function needsName(host: string, label?: string | null): boolean {
  if (!host || !host.trim()) return false;
  return !(label && label.trim());
}

function isNegativelyCached(host: string, now = Date.now()): boolean {
  const until = negativeCache.get(host);
  if (until === undefined) return false;
  if (until <= now) {
    negativeCache.delete(host);
    return false;
  }
  return true;
}

function consider(host: string, label: string | undefined | null, out: Set<string>) {
  if (!needsName(host, label)) return;
  if (isNegativelyCached(host) || inFlightIps.has(host)) return;
  out.add(host);
}

export function collectUnnamedFromDashboard(data: Dashboard): string[] {
  const out = new Set<string>();
  for (const row of data.topTalkers as TalkerRow[]) {
    consider(row.host, row.label, out);
  }
  for (const row of data.topReceivers as TalkerRow[]) {
    consider(row.host, row.label, out);
  }
  for (const row of data.topLocalTalkers as TalkerRow[]) {
    consider(row.host, row.label, out);
  }
  for (const row of data.topLocalReceivers as TalkerRow[]) {
    consider(row.host, row.label, out);
  }
  for (const row of data.hotFlows as FlowRow[]) {
    consider(row.src, row.srcLabel, out);
    consider(row.dst, row.dstLabel, out);
  }
  return [...out];
}

export function collectUnnamedFromHost(
  host: string,
  summary?: HostSummary | null,
  flows?: HostFlows | null,
): string[] {
  const out = new Set<string>();
  consider(host, summary?.label, out);
  if (summary) {
    for (const peer of summary.topPeers) {
      consider(peer.host, peer.label, out);
    }
  }
  if (flows) {
    for (const row of flows.flows) {
      consider(row.src, row.srcLabel, out);
      consider(row.dst, row.dstLabel, out);
    }
  }
  return [...out];
}

function rememberNegative(ip: string, now = Date.now()): void {
  negativeCache.set(ip, now + NEGATIVE_CACHE_TTL_MS);
}

async function flushPending(onResolved: () => void | Promise<void>): Promise<void> {
  const now = Date.now();
  if (now < backoffUntil) return;

  const batch: string[] = [];
  for (const ip of pendingIps) {
    if (isNegativelyCached(ip, now) || inFlightIps.has(ip)) {
      pendingIps.delete(ip);
      continue;
    }
    batch.push(ip);
    if (batch.length >= BATCH_SIZE) break;
  }
  if (batch.length === 0) return;

  for (const ip of batch) {
    pendingIps.delete(ip);
    inFlightIps.add(ip);
  }

  try {
    const response = await resolveHosts(batch);
    const seen = new Set<string>();
    for (const result of response.results) {
      seen.add(result.host);
      inFlightIps.delete(result.host);
      // Successful hostname: rely on row labels after invalidate; do not permanent-ban.
      if (!result.hostname) {
        rememberNegative(result.host);
      } else {
        negativeCache.delete(result.host);
      }
    }
    for (const ip of batch) {
      if (!seen.has(ip)) {
        inFlightIps.delete(ip);
        rememberNegative(ip);
      }
    }
    await onResolved();
  } catch {
    for (const ip of batch) {
      inFlightIps.delete(ip);
      rememberNegative(ip);
    }
    backoffUntil = Date.now() + ERROR_BACKOFF_MS;
  }

  if (pendingIps.size > 0 && Date.now() >= backoffUntil) {
    await flushPending(onResolved);
  }
}

/**
 * Queue unnamed IPs for batched resolve. Debounced; skips negative-cached / in-flight.
 * `onResolved` runs after a successful batch (typically query invalidation).
 */
export function queueAutoResolve(ips: string[], onResolved: () => void | Promise<void>): void {
  if (ips.length === 0) return;
  for (const ip of ips) {
    if (!ip || isNegativelyCached(ip) || inFlightIps.has(ip)) continue;
    pendingIps.add(ip);
  }
  if (pendingIps.size === 0) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    resolveChain = resolveChain.then(() => flushPending(onResolved)).catch(() => undefined);
  }, DEBOUNCE_MS);
}

/** Test helper: reset module state between tests. */
export function resetAutoResolveStateForTests(): void {
  negativeCache.clear();
  inFlightIps.clear();
  pendingIps = new Set();
  backoffUntil = 0;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  resolveChain = Promise.resolve();
}
