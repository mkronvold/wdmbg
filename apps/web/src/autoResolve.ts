import type { Dashboard, FlowRow, HostFlows, HostSummary, TalkerRow } from '@wdmbg/contracts';
import { resolveHosts } from './api/client';

export const RESOLVE_NAME_KEY = 'wdmbg.resolveName';
export type ResolveNameMode = 'disabled' | 'auto';

const BATCH_SIZE = 40;
const DEBOUNCE_MS = 600;
const ERROR_BACKOFF_MS = 5_000;

/** Session-scoped: do not re-resolve the same IP after an attempt. */
const attemptedIps = new Set<string>();
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

function consider(host: string, label: string | undefined | null, out: Set<string>) {
  if (!needsName(host, label)) return;
  if (attemptedIps.has(host) || inFlightIps.has(host)) return;
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

async function flushPending(onResolved: () => void | Promise<void>): Promise<void> {
  const now = Date.now();
  if (now < backoffUntil) return;

  const batch: string[] = [];
  for (const ip of pendingIps) {
    if (attemptedIps.has(ip) || inFlightIps.has(ip)) {
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
    await resolveHosts(batch);
    for (const ip of batch) {
      attemptedIps.add(ip);
      inFlightIps.delete(ip);
    }
    await onResolved();
  } catch {
    for (const ip of batch) {
      attemptedIps.add(ip);
      inFlightIps.delete(ip);
    }
    backoffUntil = Date.now() + ERROR_BACKOFF_MS;
  }

  if (pendingIps.size > 0 && Date.now() >= backoffUntil) {
    await flushPending(onResolved);
  }
}

/**
 * Queue unnamed IPs for batched resolve. Debounced; skips already attempted / in-flight.
 * `onResolved` runs after a successful batch (typically query invalidation).
 */
export function queueAutoResolve(ips: string[], onResolved: () => void | Promise<void>): void {
  if (ips.length === 0) return;
  for (const ip of ips) {
    if (!ip || attemptedIps.has(ip) || inFlightIps.has(ip)) continue;
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
  attemptedIps.clear();
  inFlightIps.clear();
  pendingIps = new Set();
  backoffUntil = 0;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  resolveChain = Promise.resolve();
}
