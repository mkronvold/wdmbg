import {
  BUCKET_INTERVAL_SEC,
  RING_BUCKET_COUNT,
  type FlowSample,
  type L4,
  type QueryWindow,
  type RollupEnvelope,
  WINDOW_SECONDS,
} from '@wdmbg/contracts';

export interface StoredFlow {
  src: string;
  dst: string;
  srcPort: number;
  dstPort: number;
  l4: L4;
  l7?: string;
  bytesSrcToDst: number;
  bytesDstToSrc: number;
  packetsSrcToDst: number;
  packetsDstToSrc: number;
}

export interface RingBucket {
  t: number;
  flows: Map<string, StoredFlow>;
}

export interface HostRelativeBytes {
  txBytes: number;
  rxBytes: number;
}

/**
 * Flow identity is the 5-tuple only. L7 is a label and must not split merges
 * (both ports can be well-known, so per-packet GuessL7 can flip).
 */
export function flowKey(f: Pick<StoredFlow, 'src' | 'dst' | 'srcPort' | 'dstPort' | 'l4'>): string {
  return `${f.src}\0${f.srcPort}\0${f.dst}\0${f.dstPort}\0${f.l4}`;
}

export function hostRelative(host: string, flow: StoredFlow): HostRelativeBytes | null {
  if (flow.src === host) {
    return { txBytes: flow.bytesSrcToDst, rxBytes: flow.bytesDstToSrc };
  }
  if (flow.dst === host) {
    return { txBytes: flow.bytesDstToSrc, rxBytes: flow.bytesSrcToDst };
  }
  return null;
}

/** Stable orientation: lower endpoint string wins as src (matches probe canonicalize). */
export function canonicalizeFlow(flow: StoredFlow): StoredFlow {
  if (flow.src < flow.dst || (flow.src === flow.dst && flow.srcPort <= flow.dstPort)) {
    return flow;
  }
  const flipped: StoredFlow = {
    src: flow.dst,
    dst: flow.src,
    srcPort: flow.dstPort,
    dstPort: flow.srcPort,
    l4: flow.l4,
    bytesSrcToDst: flow.bytesDstToSrc,
    bytesDstToSrc: flow.bytesSrcToDst,
    packetsSrcToDst: flow.packetsDstToSrc,
    packetsDstToSrc: flow.packetsSrcToDst,
  };
  if (flow.l7 !== undefined) {
    flipped.l7 = flow.l7;
  }
  return flipped;
}

function toStored(sample: FlowSample): StoredFlow {
  const flow: StoredFlow = {
    src: sample.src,
    dst: sample.dst,
    srcPort: sample.srcPort,
    dstPort: sample.dstPort,
    l4: sample.l4,
    bytesSrcToDst: sample.bytesSrcToDst,
    bytesDstToSrc: sample.bytesDstToSrc,
    packetsSrcToDst: sample.packetsSrcToDst,
    packetsDstToSrc: sample.packetsDstToSrc,
  };
  if (sample.l7 !== undefined) {
    flow.l7 = sample.l7;
  }
  return canonicalizeFlow(flow);
}

function mergeFlow(into: StoredFlow, add: StoredFlow): void {
  into.bytesSrcToDst += add.bytesSrcToDst;
  into.bytesDstToSrc += add.bytesDstToSrc;
  into.packetsSrcToDst += add.packetsSrcToDst;
  into.packetsDstToSrc += add.packetsDstToSrc;
  if (!into.l7 && add.l7) {
    into.l7 = add.l7;
  }
}

export class TrafficStore {
  readonly size = RING_BUCKET_COUNT;
  readonly intervalSec = BUCKET_INTERVAL_SEC;
  private readonly ring: RingBucket[];
  private writeIndex = 0;
  private listeners = new Set<(bucket: RingBucket) => void>();

  constructor() {
    this.ring = Array.from({ length: this.size }, () => ({
      t: 0,
      flows: new Map(),
    }));
  }

  onBucket(listener: (bucket: RingBucket) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  ingest(envelope: RollupEnvelope): { acceptedBuckets: number; acceptedFlows: number } {
    let acceptedBuckets = 0;
    let acceptedFlows = 0;
    for (const bucket of envelope.buckets) {
      const slot = this.ensureBucket(bucket.t);
      for (const sample of bucket.flows) {
        const stored = toStored(sample);
        const key = flowKey(stored);
        const existing = slot.flows.get(key);
        if (existing) {
          mergeFlow(existing, stored);
        } else {
          slot.flows.set(key, { ...stored });
        }
        acceptedFlows += 1;
      }
      acceptedBuckets += 1;
      for (const listener of this.listeners) {
        listener(slot);
      }
    }
    return { acceptedBuckets, acceptedFlows };
  }

  private ensureBucket(t: number): RingBucket {
    for (let i = 0; i < this.size; i += 1) {
      const b = this.ring[i];
      if (b && b.t === t) {
        return b;
      }
    }
    const slot = this.ring[this.writeIndex];
    if (!slot) {
      throw new Error('ring slot missing');
    }
    slot.t = t;
    slot.flows = new Map();
    this.writeIndex = (this.writeIndex + 1) % this.size;
    return slot;
  }

  bucketsForWindow(window: QueryWindow, nowSec = Math.floor(Date.now() / 1000)): RingBucket[] {
    const seconds = WINDOW_SECONDS[window];
    const minT = nowSec - seconds;
    return this.ring.filter((b) => b.t > minT && b.t <= nowSec).sort((a, b) => b.t - a.t);
  }

  aggregateFlows(window: QueryWindow, nowSec?: number): StoredFlow[] {
    const merged = new Map<string, StoredFlow>();
    for (const bucket of this.bucketsForWindow(window, nowSec)) {
      for (const flow of bucket.flows.values()) {
        const key = flowKey(flow);
        const existing = merged.get(key);
        if (existing) {
          mergeFlow(existing, flow);
        } else {
          merged.set(key, { ...flow });
        }
      }
    }
    return [...merged.values()];
  }

  clear(): void {
    for (const slot of this.ring) {
      slot.t = 0;
      slot.flows = new Map();
    }
    this.writeIndex = 0;
  }
}
