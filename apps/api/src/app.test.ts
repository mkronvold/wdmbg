import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { TrafficStore } from './traffic/store.js';
import { MemoryMetaStore } from './meta/store.js';

describe('API', () => {
  const store = new TrafficStore();
  const meta = new MemoryMetaStore({ ptrEnabled: false });
  const appPromise = buildApp({ store, meta, logger: false });

  beforeEach(() => {
    store.clear();
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const app = await appPromise;
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'wdmbg-api',
    });
  });

  it('POST /api/ingest/rollups accepts valid envelope', async () => {
    const app = await appPromise;
    const now = Math.floor(Date.now() / 1000);
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/rollups',
      payload: {
        probeId: 'probe-1',
        sentAt: new Date().toISOString(),
        buckets: [
          {
            t: now,
            flows: [
              {
                src: '10.0.0.10',
                dst: '1.1.1.1',
                srcPort: 12345,
                dstPort: 443,
                l4: 'tcp',
                l7: 'https',
                bytesSrcToDst: 100,
                bytesDstToSrc: 500,
                packetsSrcToDst: 1,
                packetsDstToSrc: 2,
              },
            ],
          },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ ok: true, acceptedBuckets: 1, acceptedFlows: 1 });
  });

  it('POST /api/ingest/rollups rejects invalid body', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/rollups',
      payload: { probeId: 'x' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/dashboard returns aggregates', async () => {
    const app = await appPromise;
    const now = Math.floor(Date.now() / 1000);
    await app.inject({
      method: 'POST',
      url: '/api/ingest/rollups',
      payload: {
        probeId: 'probe-1',
        sentAt: new Date().toISOString(),
        buckets: [
          {
            t: now,
            flows: [
              {
                src: '10.0.0.10',
                dst: '8.8.8.8',
                srcPort: 1,
                dstPort: 53,
                l4: 'udp',
                l7: 'dns',
                bytesSrcToDst: 40,
                bytesDstToSrc: 120,
                packetsSrcToDst: 1,
                packetsDstToSrc: 1,
              },
            ],
          },
        ],
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/dashboard?window=30s' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.window).toBe('30s');
    expect(body.topTalkers.length).toBeGreaterThan(0);
    expect(body.topProtocols[0]?.protocol).toBe('dns');
  });

  it('GET host summary and flows with host-relative tx/rx', async () => {
    const app = await appPromise;
    const now = Math.floor(Date.now() / 1000);
    await app.inject({
      method: 'POST',
      url: '/api/ingest/rollups',
      payload: {
        probeId: 'probe-1',
        sentAt: new Date().toISOString(),
        buckets: [
          {
            t: now,
            flows: [
              {
                src: '10.0.0.10',
                dst: '1.1.1.1',
                srcPort: 9,
                dstPort: 443,
                l4: 'tcp',
                bytesSrcToDst: 10,
                bytesDstToSrc: 90,
                packetsSrcToDst: 1,
                packetsDstToSrc: 1,
              },
            ],
          },
        ],
      },
    });
    const summary = await app.inject({
      method: 'GET',
      url: '/api/hosts/10.0.0.10?window=5s',
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({ host: '10.0.0.10', txBytes: 10, rxBytes: 90 });

    const flows = await app.inject({
      method: 'GET',
      url: '/api/hosts/10.0.0.10/flows?window=5s',
    });
    expect(flows.statusCode).toBe(200);
    expect(flows.json().flows[0]).toMatchObject({ txBytes: 10, rxBytes: 90 });
  });

  it('PUT alias and resolve prefer alias', async () => {
    const app = await appPromise;
    const put = await app.inject({
      method: 'PUT',
      url: '/api/alias',
      payload: { host: '10.0.0.10', alias: 'nas' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().alias).toBe('nas');

    const resolved = await app.inject({
      method: 'POST',
      url: '/api/resolve',
      payload: { hosts: ['10.0.0.10'] },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().results[0]).toMatchObject({
      host: '10.0.0.10',
      hostname: 'nas',
      source: 'alias',
    });
  });
});
