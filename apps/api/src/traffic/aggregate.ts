import {
  isLocalAddress,
  isLocalPair,
  type CountryRow,
  type FlowRow,
  type ProtocolRow,
  type QueryWindow,
  type TalkerRow,
  type TrafficBucket,
  type TrafficSummary,
  WINDOW_SECONDS,
} from '@wdmbg/contracts';
import { hostRelative, type StoredFlow, type TrafficStore } from './store.js';

export interface LabelLookup {
  getLabel(host: string): string | undefined;
  getCountry(host: string): string;
}

export const defaultCountryLookup: LabelLookup = {
  getLabel: () => undefined,
  getCountry: (host: string) => (isLocalAddress(host) ? 'Local' : 'Unknown'),
};

export interface AggregateOptions {
  /** When true, drop local↔local flows before aggregation. */
  excludeLocal?: boolean;
}

function protocolOf(flow: StoredFlow): string {
  return flow.l7 ?? flow.l4;
}

function sortByBytesDesc<T>(rows: T[], pick: (row: T) => number, limit: number): T[] {
  return [...rows].sort((a, b) => pick(b) - pick(a)).slice(0, limit);
}

export function filterFlows(flows: StoredFlow[], opts?: AggregateOptions): StoredFlow[] {
  if (!opts?.excludeLocal) return flows;
  return flows.filter((f) => !isLocalPair(f.src, f.dst));
}

function emptyBucket(): TrafficBucket {
  return { txBytes: 0, rxBytes: 0, totalBytes: 0 };
}

/**
 * Attribute flow bytes to TX/RX.
 * When one end is LAN and the other is not, use LAN-centric direction
 * (TX = LAN→remote, RX = remote→LAN). Otherwise use flow orientation
 * (TX = src→dst, RX = dst→src), matching hot-flow semantics.
 */
function directionalBytes(flow: StoredFlow): { txBytes: number; rxBytes: number } {
  const srcLocal = isLocalAddress(flow.src);
  const dstLocal = isLocalAddress(flow.dst);
  if (srcLocal && !dstLocal) {
    return { txBytes: flow.bytesSrcToDst, rxBytes: flow.bytesDstToSrc };
  }
  if (!srcLocal && dstLocal) {
    return { txBytes: flow.bytesDstToSrc, rxBytes: flow.bytesSrcToDst };
  }
  return { txBytes: flow.bytesSrcToDst, rxBytes: flow.bytesDstToSrc };
}

/** Split window flows into always-on Local vs Internet buckets. */
export function buildTrafficSummary(flows: StoredFlow[]): TrafficSummary {
  const local = emptyBucket();
  const internet = emptyBucket();
  for (const flow of flows) {
    const { txBytes, rxBytes } = directionalBytes(flow);
    const bucket = isLocalPair(flow.src, flow.dst) ? local : internet;
    bucket.txBytes += txBytes;
    bucket.rxBytes += rxBytes;
    bucket.totalBytes += txBytes + rxBytes;
  }
  return { local, internet };
}

export function buildHostStats(
  flows: StoredFlow[],
  labels: LabelLookup = defaultCountryLookup,
): Map<string, TalkerRow> {
  const hosts = new Map<string, TalkerRow>();

  const bump = (host: string, tx: number, rx: number) => {
    const existing = hosts.get(host);
    if (existing) {
      existing.txBytes += tx;
      existing.rxBytes += rx;
      existing.totalBytes += tx + rx;
      return;
    }
    const label = labels.getLabel(host);
    const row: TalkerRow = {
      host,
      txBytes: tx,
      rxBytes: rx,
      totalBytes: tx + rx,
      country: labels.getCountry(host),
    };
    if (label !== undefined) {
      row.label = label;
    }
    hosts.set(host, row);
  };

  for (const flow of flows) {
    bump(flow.src, flow.bytesSrcToDst, flow.bytesDstToSrc);
    bump(flow.dst, flow.bytesDstToSrc, flow.bytesSrcToDst);
  }
  return hosts;
}

export function topTalkers(flows: StoredFlow[], limit = 10, labels?: LabelLookup): TalkerRow[] {
  return sortByBytesDesc([...buildHostStats(flows, labels).values()], (r) => r.txBytes, limit);
}

export function topReceivers(flows: StoredFlow[], limit = 10, labels?: LabelLookup): TalkerRow[] {
  return sortByBytesDesc([...buildHostStats(flows, labels).values()], (r) => r.rxBytes, limit);
}

export function topProtocols(flows: StoredFlow[], limit = 10): ProtocolRow[] {
  const map = new Map<string, ProtocolRow>();
  for (const flow of flows) {
    const protocol = protocolOf(flow);
    const bytes = flow.bytesSrcToDst + flow.bytesDstToSrc;
    const packets = flow.packetsSrcToDst + flow.packetsDstToSrc;
    const existing = map.get(protocol);
    if (existing) {
      existing.bytes += bytes;
      existing.packets += packets;
    } else {
      map.set(protocol, { protocol, bytes, packets });
    }
  }
  return sortByBytesDesc([...map.values()], (r) => r.bytes, limit);
}

export function toFlowRow(
  flow: StoredFlow,
  host?: string,
  labels: LabelLookup = defaultCountryLookup,
): FlowRow {
  const bytes = flow.bytesSrcToDst + flow.bytesDstToSrc;
  const packets = flow.packetsSrcToDst + flow.packetsDstToSrc;
  const row: FlowRow = {
    src: flow.src,
    srcPort: flow.srcPort,
    dst: flow.dst,
    dstPort: flow.dstPort,
    l4: flow.l4,
    bytes,
    packets,
  };
  if (flow.l7 !== undefined) {
    row.l7 = flow.l7;
  }
  const srcLabel = labels.getLabel(flow.src);
  const dstLabel = labels.getLabel(flow.dst);
  if (srcLabel !== undefined) row.srcLabel = srcLabel;
  if (dstLabel !== undefined) row.dstLabel = dstLabel;
  if (host) {
    const rel = hostRelative(host, flow);
    if (rel) {
      row.txBytes = rel.txBytes;
      row.rxBytes = rel.rxBytes;
    }
  } else {
    // Hot flows (no host context): TX = src→dst, RX = dst→src.
    row.txBytes = flow.bytesSrcToDst;
    row.rxBytes = flow.bytesDstToSrc;
  }
  return row;
}

export function hotFlows(
  flows: StoredFlow[],
  limit = 15,
  labels: LabelLookup = defaultCountryLookup,
): FlowRow[] {
  return sortByBytesDesc(
    flows.map((f) => toFlowRow(f, undefined, labels)),
    (r) => r.bytes,
    limit,
  );
}

export function topCountries(
  flows: StoredFlow[],
  limit = 10,
  labels: LabelLookup = defaultCountryLookup,
): CountryRow[] {
  const map = new Map<string, number>();
  for (const flow of flows) {
    const bytes = flow.bytesSrcToDst + flow.bytesDstToSrc;
    const srcLocal = isLocalAddress(flow.src);
    const dstLocal = isLocalAddress(flow.dst);
    if (srcLocal && !dstLocal) {
      const c = labels.getCountry(flow.dst);
      map.set(c, (map.get(c) ?? 0) + bytes);
    } else if (dstLocal && !srcLocal) {
      const c = labels.getCountry(flow.src);
      map.set(c, (map.get(c) ?? 0) + bytes);
    } else if (!srcLocal && !dstLocal) {
      const c1 = labels.getCountry(flow.src);
      const c2 = labels.getCountry(flow.dst);
      map.set(c1, (map.get(c1) ?? 0) + flow.bytesSrcToDst);
      map.set(c2, (map.get(c2) ?? 0) + flow.bytesDstToSrc);
    } else {
      map.set('Local', (map.get('Local') ?? 0) + bytes);
    }
  }
  return sortByBytesDesc(
    [...map.entries()].map(([country, bytes]) => ({ country, bytes })),
    (r) => r.bytes,
    limit,
  );
}

export function hostSummary(
  store: TrafficStore,
  host: string,
  window: QueryWindow,
  nowSec = Math.floor(Date.now() / 1000),
  labels: LabelLookup = defaultCountryLookup,
  opts?: AggregateOptions,
) {
  const flows = filterFlows(
    store.aggregateFlows(window, nowSec).filter((f) => f.src === host || f.dst === host),
    opts,
  );
  let txBytes = 0;
  let rxBytes = 0;
  const peerMap = new Map<string, TalkerRow>();

  for (const flow of flows) {
    const rel = hostRelative(host, flow);
    if (!rel) continue;
    txBytes += rel.txBytes;
    rxBytes += rel.rxBytes;
    const peer = flow.src === host ? flow.dst : flow.src;
    const existing = peerMap.get(peer);
    if (existing) {
      existing.txBytes += rel.txBytes;
      existing.rxBytes += rel.rxBytes;
      existing.totalBytes += rel.txBytes + rel.rxBytes;
    } else {
      const label = labels.getLabel(peer);
      const row: TalkerRow = {
        host: peer,
        txBytes: rel.txBytes,
        rxBytes: rel.rxBytes,
        totalBytes: rel.txBytes + rel.rxBytes,
        country: labels.getCountry(peer),
      };
      if (label !== undefined) {
        row.label = label;
      }
      peerMap.set(peer, row);
    }
  }

  const seconds = WINDOW_SECONDS[window];
  const label = labels.getLabel(host);
  return {
    host,
    ...(label !== undefined ? { label } : {}),
    window,
    generatedAt: new Date(nowSec * 1000).toISOString(),
    txBytes,
    rxBytes,
    totalBytes: txBytes + rxBytes,
    txRateBps: seconds > 0 ? (txBytes * 8) / seconds : 0,
    rxRateBps: seconds > 0 ? (rxBytes * 8) / seconds : 0,
    topProtocols: topProtocols(flows),
    topPeers: sortByBytesDesc([...peerMap.values()], (r) => r.totalBytes, 10),
  };
}

export function hostFlows(
  store: TrafficStore,
  host: string,
  window: QueryWindow,
  nowSec = Math.floor(Date.now() / 1000),
  limit = 50,
  labels: LabelLookup = defaultCountryLookup,
  opts?: AggregateOptions,
) {
  const flows = filterFlows(
    store.aggregateFlows(window, nowSec).filter((f) => f.src === host || f.dst === host),
    opts,
  ).map((f) => toFlowRow(f, host, labels));
  return {
    host,
    window,
    generatedAt: new Date(nowSec * 1000).toISOString(),
    flows: sortByBytesDesc(flows, (r) => r.bytes, limit),
  };
}

export function buildDashboard(
  store: TrafficStore,
  window: QueryWindow,
  nowSec = Math.floor(Date.now() / 1000),
  labels: LabelLookup = defaultCountryLookup,
  opts?: AggregateOptions,
) {
  const allFlows = store.aggregateFlows(window, nowSec);
  const flows = filterFlows(allFlows, opts);
  return {
    window,
    generatedAt: new Date(nowSec * 1000).toISOString(),
    topTalkers: topTalkers(flows, 10, labels),
    topReceivers: topReceivers(flows, 10, labels),
    topProtocols: topProtocols(flows),
    hotFlows: hotFlows(flows, 15, labels),
    topCountries: topCountries(flows, 10, labels),
    // Always both buckets for the window — independent of excludeLocal.
    summary: buildTrafficSummary(allFlows),
  };
}
