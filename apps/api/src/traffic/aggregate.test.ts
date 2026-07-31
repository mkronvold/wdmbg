import { describe, expect, it } from 'vitest';
import { TrafficStore, hostRelative } from './store.js';
import { buildDashboard, hostFlows, hostSummary, topReceivers, topTalkers } from './aggregate.js';

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
