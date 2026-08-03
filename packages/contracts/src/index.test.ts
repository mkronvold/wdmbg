import { describe, expect, it } from 'vitest';
import {
  dashboardSchema,
  flowRowSchema,
  healthSchema,
  isLocalAddress,
  isLocalPair,
  resolveResultSchema,
  resolveSourceSchema,
  RING_BUCKET_COUNT,
  rollupEnvelopeSchema,
  trafficSummarySchema,
  windowSchema,
  WINDOW_SECONDS,
} from './index.js';

describe('healthSchema', () => {
  it('accepts a valid health payload with geoip status', () => {
    const parsed = healthSchema.parse({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
      geoip: { configured: false, present: false },
    });
    expect(parsed.status).toBe('ok');
    expect(parsed.geoip).toEqual({ configured: false, present: false });
  });
});

describe('windowSchema', () => {
  it('maps windows to seconds', () => {
    expect(WINDOW_SECONDS[windowSchema.parse('5s')]).toBe(5);
    expect(WINDOW_SECONDS[windowSchema.parse('30s')]).toBe(30);
    expect(WINDOW_SECONDS[windowSchema.parse('5m')]).toBe(300);
    expect(WINDOW_SECONDS[windowSchema.parse('15m')]).toBe(900);
    expect(WINDOW_SECONDS[windowSchema.parse('30m')]).toBe(1800);
    expect(WINDOW_SECONDS[windowSchema.parse('1h')]).toBe(3600);
  });

  it('sizes the ring for 1 hour of 1s buckets', () => {
    expect(RING_BUCKET_COUNT).toBe(3600);
    expect(RING_BUCKET_COUNT).toBe(WINDOW_SECONDS['1h']);
  });
});

describe('rollupEnvelopeSchema', () => {
  it('accepts a rollup with one flow', () => {
    const parsed = rollupEnvelopeSchema.parse({
      probeId: 'probe-1',
      sentAt: '2026-07-30T12:00:00.000Z',
      buckets: [
        {
          t: 1_722_000_000,
          flows: [
            {
              src: '10.0.0.10',
              dst: '1.1.1.1',
              srcPort: 54321,
              dstPort: 443,
              l4: 'tcp',
              l7: 'https',
              bytesSrcToDst: 1000,
              bytesDstToSrc: 5000,
              packetsSrcToDst: 10,
              packetsDstToSrc: 8,
            },
          ],
        },
      ],
    });
    expect(parsed.intervalSec).toBe(1);
    expect(parsed.buckets[0]?.flows[0]?.l7).toBe('https');
  });

  it('rejects empty buckets', () => {
    expect(() =>
      rollupEnvelopeSchema.parse({
        probeId: 'p',
        sentAt: '2026-07-30T12:00:00.000Z',
        buckets: [],
      }),
    ).toThrow();
  });
});

describe('isLocalAddress', () => {
  it('detects RFC1918 and loopback', () => {
    expect(isLocalAddress('10.0.0.1')).toBe(true);
    expect(isLocalAddress('192.168.1.1')).toBe(true);
    expect(isLocalAddress('172.16.0.1')).toBe(true);
    expect(isLocalAddress('127.0.0.1')).toBe(true);
    expect(isLocalAddress('8.8.8.8')).toBe(false);
    expect(isLocalAddress('1.1.1.1')).toBe(false);
  });
});

describe('isLocalPair', () => {
  it('is true only when both ends are local', () => {
    expect(isLocalPair('10.0.0.1', '192.168.1.1')).toBe(true);
    expect(isLocalPair('10.0.0.1', '1.1.1.1')).toBe(false);
    expect(isLocalPair('8.8.8.8', '1.1.1.1')).toBe(false);
  });
});

describe('flowRowSchema', () => {
  it('accepts optional src/dst labels', () => {
    const parsed = flowRowSchema.parse({
      src: '10.0.0.1',
      srcPort: 1,
      dst: '1.1.1.1',
      dstPort: 443,
      l4: 'tcp',
      bytes: 10,
      packets: 1,
      srcLabel: 'nas',
      dstLabel: 'cloudflare',
    });
    expect(parsed.srcLabel).toBe('nas');
    expect(parsed.dstLabel).toBe('cloudflare');
  });
});

describe('trafficSummarySchema', () => {
  it('accepts local and internet byte buckets', () => {
    const summary = trafficSummarySchema.parse({
      local: { txBytes: 100, rxBytes: 200, totalBytes: 300 },
      internet: { txBytes: 1000, rxBytes: 5000, totalBytes: 6000 },
    });
    expect(summary.local.totalBytes).toBe(300);
    expect(summary.internet.txBytes).toBe(1000);
  });

  it('is required on dashboard payloads', () => {
    const parsed = dashboardSchema.parse({
      window: '30s',
      generatedAt: '2026-07-30T12:00:00.000Z',
      topTalkers: [],
      topReceivers: [],
      topProtocols: [],
      hotFlows: [],
      topCountries: [],
      summary: {
        local: { txBytes: 0, rxBytes: 0, totalBytes: 0 },
        internet: { txBytes: 0, rxBytes: 0, totalBytes: 0 },
      },
    });
    expect(parsed.summary.local.txBytes).toBe(0);
  });
});

describe('resolveSourceSchema', () => {
  it('accepts AdGuard sources and legacy cache', () => {
    for (const source of [
      'alias',
      'adguard-rewrite',
      'adguard-dhcp',
      'adguard-client',
      'ptr',
      'cache',
      'none',
    ] as const) {
      expect(resolveSourceSchema.parse(source)).toBe(source);
    }
    expect(
      resolveResultSchema.parse({
        host: '10.0.0.1',
        hostname: 'nas.lan',
        source: 'adguard-rewrite',
      }).source,
    ).toBe('adguard-rewrite');
  });
});
