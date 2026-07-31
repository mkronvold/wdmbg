import { describe, expect, it } from 'vitest';
import {
  healthSchema,
  isLocalAddress,
  resolveResultSchema,
  resolveSourceSchema,
  RING_BUCKET_COUNT,
  rollupEnvelopeSchema,
  windowSchema,
  WINDOW_SECONDS,
} from './index.js';

describe('healthSchema', () => {
  it('accepts a valid health payload', () => {
    const parsed = healthSchema.parse({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
    });
    expect(parsed.status).toBe('ok');
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
