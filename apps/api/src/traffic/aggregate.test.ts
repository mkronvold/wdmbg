import { describe, expect, it } from 'vitest';
import { TrafficStore, hostRelative } from './store.js';
import {
  buildDashboard,
  buildTrafficSummary,
  hostFlows,
  hostSummary,
  topLocalReceivers,
  topLocalTalkers,
  topReceivers,
  topTalkers,
} from './aggregate.js';

function seed(store: TrafficStore, nowSec: number) {
  store.ingest({
    probeId: 't',
    sentAt: new Date(nowSec * 1000).toISOString(),
    intervalSec: 1,
    buckets: [
      {
        t: nowSec,
        flows: [
          {
            src: '10.0.0.10',
            dst: '1.1.1.1',
            srcPort: 40000,
            dstPort: 443,
            l4: 'tcp',
            l7: 'https',
            bytesSrcToDst: 1_000,
            bytesDstToSrc: 9_000,
            packetsSrcToDst: 5,
            packetsDstToSrc: 8,
          },
          {
            src: '10.0.0.20',
            dst: '10.0.0.10',
            srcPort: 22,
            dstPort: 50000,
            l4: 'tcp',
            l7: 'ssh',
            bytesSrcToDst: 200,
            bytesDstToSrc: 50,
            packetsSrcToDst: 2,
            packetsDstToSrc: 1,
          },
        ],
      },
    ],
  });
}

describe('hostRelative tx/rx', () => {
  it('flips counters when host is destination', () => {
    const flow = {
      src: '10.0.0.10',
      dst: '1.1.1.1',
      srcPort: 1,
      dstPort: 443,
      l4: 'tcp' as const,
      bytesSrcToDst: 100,
      bytesDstToSrc: 900,
      packetsSrcToDst: 1,
      packetsDstToSrc: 2,
    };
    expect(hostRelative('10.0.0.10', flow)).toEqual({ txBytes: 100, rxBytes: 900 });
    expect(hostRelative('1.1.1.1', flow)).toEqual({ txBytes: 900, rxBytes: 100 });
    expect(hostRelative('9.9.9.9', flow)).toBeNull();
  });
});

describe('aggregation', () => {
  it('ranks talkers and receivers', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const flows = store.aggregateFlows('5s', now);
    const talkers = topTalkers(flows);
    const receivers = topReceivers(flows);

    // 1.1.1.1 tx = 9000 (reply direction attributed as talker from remote)
    expect(talkers[0]?.host).toBe('1.1.1.1');
    expect(talkers[0]?.txBytes).toBe(9000);
    // 10.0.0.10 rx = 9000 + 200 = 9200
    expect(receivers[0]?.host).toBe('10.0.0.10');
    expect(receivers[0]?.rxBytes).toBe(9200);

    const lan = talkers.find((t) => t.host === '10.0.0.10');
    expect(lan?.txBytes).toBe(1050);
  });

  it('builds dashboard with local country rules', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const dash = buildDashboard(store, '30s', now);
    expect(dash.topProtocols.some((p) => p.protocol === 'https')).toBe(true);
    expect(dash.hotFlows.length).toBeGreaterThan(0);
    expect(dash.topCountries.some((c) => c.country === 'Unknown' || c.country === 'Local')).toBe(
      true,
    );
  });

  it('exposes src→dst TX and dst→src RX on hot flows', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const dash = buildDashboard(store, '30s', now);
    const https = dash.hotFlows.find((f) => f.dst === '1.1.1.1');
    expect(https?.txBytes).toBe(1000);
    expect(https?.rxBytes).toBe(9000);
  });

  it('attaches flow labels and can exclude local pairs', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const labels = {
      getLabel: (host: string) => (host === '10.0.0.10' ? 'laptop' : undefined),
      getCountry: (host: string) => (host.startsWith('10.') ? 'Local' : 'Unknown'),
    };
    const dash = buildDashboard(store, '30s', now, labels);
    const https = dash.hotFlows.find((f) => f.dst === '1.1.1.1');
    expect(https?.srcLabel).toBe('laptop');
    const filtered = buildDashboard(store, '30s', now, labels, { excludeLocal: true });
    expect(filtered.hotFlows.every((f) => f.dst === '1.1.1.1' || f.src === '1.1.1.1')).toBe(true);
    expect(filtered.hotFlows.some((f) => f.src === '10.0.0.20' && f.dst === '10.0.0.10')).toBe(
      false,
    );
  });

  it('ranks only LAN hosts in top talkers-to-local / receivers-from-local', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const flows = store.aggregateFlows('5s', now);
    const localTalkers = topLocalTalkers(flows);
    const localReceivers = topLocalReceivers(flows);

    expect(localTalkers.every((r) => r.host.startsWith('10.'))).toBe(true);
    expect(localReceivers.every((r) => r.host.startsWith('10.'))).toBe(true);
    expect(localTalkers.some((r) => r.host === '1.1.1.1')).toBe(false);
    expect(localReceivers.some((r) => r.host === '1.1.1.1')).toBe(false);

    // 10.0.0.10 tx = 1000 (to remote) + 50 (reply to LAN peer) = 1050
    expect(localTalkers[0]?.host).toBe('10.0.0.10');
    expect(localTalkers[0]?.txBytes).toBe(1050);
    // 10.0.0.10 rx = 9000 + 200 = 9200
    expect(localReceivers[0]?.host).toBe('10.0.0.10');
    expect(localReceivers[0]?.rxBytes).toBe(9200);
  });

  it('excludeLocal drops LAN↔LAN contribution from local host totals', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const withLocal = buildDashboard(store, '5s', now);
    const withoutLocal = buildDashboard(store, '5s', now, undefined, { excludeLocal: true });

    expect(withLocal.topLocalTalkers.every((r) => !r.host.includes('1.1.1.1'))).toBe(true);
    expect(withoutLocal.topLocalTalkers.every((r) => !r.host.includes('1.1.1.1'))).toBe(true);
    expect(withoutLocal.topLocalReceivers.every((r) => !r.host.includes('1.1.1.1'))).toBe(true);

    const laptopShown = withLocal.topLocalTalkers.find((r) => r.host === '10.0.0.10');
    const laptopHidden = withoutLocal.topLocalTalkers.find((r) => r.host === '10.0.0.10');
    expect(laptopShown?.txBytes).toBe(1050);
    // LAN↔LAN (50 tx reply side from 10.0.0.10 as dst) dropped
    expect(laptopHidden?.txBytes).toBe(1000);
    expect(laptopHidden?.rxBytes).toBe(9000);

    // Peer that only appears on LAN↔LAN is gone when local traffic hidden
    expect(withLocal.topLocalTalkers.some((r) => r.host === '10.0.0.20')).toBe(true);
    expect(withoutLocal.topLocalTalkers.some((r) => r.host === '10.0.0.20')).toBe(false);
  });

  it('splits local vs internet byte buckets (independent of excludeLocal)', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    // seed: local pair 10.0.0.20→10.0.0.10 (200+50) and internet 10.0.0.10→1.1.1.1 (1000+9000)
    const summary = buildTrafficSummary(store.aggregateFlows('5s', now));
    expect(summary.local).toEqual({ txBytes: 200, rxBytes: 50, totalBytes: 250 });
    // LAN-centric: TX = LAN→remote 1000, RX = remote→LAN 9000
    expect(summary.internet).toEqual({ txBytes: 1000, rxBytes: 9000, totalBytes: 10_000 });

    const withLocal = buildDashboard(store, '5s', now);
    const withoutLocal = buildDashboard(store, '5s', now, undefined, { excludeLocal: true });
    expect(withLocal.summary).toEqual(summary);
    expect(withoutLocal.summary).toEqual(summary);
    expect(withoutLocal.hotFlows).toHaveLength(1);
  });

  it('returns host-relative flows', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    seed(store, now);
    const summary = hostSummary(store, '10.0.0.10', '5s', now);
    expect(summary.txBytes).toBe(1050);
    expect(summary.rxBytes).toBe(9200);
    const flows = hostFlows(store, '10.0.0.10', '5s', now);
    expect(flows.flows.every((f) => f.txBytes !== undefined && f.rxBytes !== undefined)).toBe(true);
    const external = flows.flows.find((f) => f.dst === '1.1.1.1' || f.src === '1.1.1.1');
    expect(external?.txBytes).toBe(1000);
    expect(external?.rxBytes).toBe(9000);
  });

  it('merges duplicate flow keys across buckets', () => {
    const store = new TrafficStore();
    const now = 1_800_000_000;
    store.ingest({
      probeId: 't',
      sentAt: new Date().toISOString(),
      intervalSec: 1,
      buckets: [
        {
          t: now - 1,
          flows: [
            {
              src: '10.0.0.1',
              dst: '8.8.8.8',
              srcPort: 1,
              dstPort: 53,
              l4: 'udp',
              l7: 'dns',
              bytesSrcToDst: 40,
              bytesDstToSrc: 80,
              packetsSrcToDst: 1,
              packetsDstToSrc: 1,
            },
          ],
        },
        {
          t: now,
          flows: [
            {
              src: '10.0.0.1',
              dst: '8.8.8.8',
              srcPort: 1,
              dstPort: 53,
              l4: 'udp',
              l7: 'dns',
              bytesSrcToDst: 40,
              bytesDstToSrc: 80,
              packetsSrcToDst: 1,
              packetsDstToSrc: 1,
            },
          ],
        },
      ],
    });
    const flows = store.aggregateFlows('5s', now);
    expect(flows).toHaveLength(1);
    expect(flows[0]?.bytesSrcToDst).toBe(80);
    expect(flows[0]?.bytesDstToSrc).toBe(160);
  });
});
