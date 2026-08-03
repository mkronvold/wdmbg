import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { appName, appVersion } from '@wdmbg/config';
import {
  aliasPutSchema,
  aliasSchema,
  dashboardSchema,
  healthSchema,
  hostFlowsSchema,
  hostSummarySchema,
  resolveRequestSchema,
  resolveResponseSchema,
  rollupEnvelopeSchema,
  windowSchema,
  type QueryWindow,
} from '@wdmbg/contracts';
import { ZodError } from 'zod';
import { buildDashboard, hostFlows, hostSummary, type LabelLookup } from './traffic/aggregate.js';
import { TrafficStore } from './traffic/store.js';
import { MemoryMetaStore, type MetaStore } from './meta/store.js';
import { GeoIpService } from './geoip.js';

export interface AppDeps {
  store?: TrafficStore;
  meta?: MetaStore;
  geoip?: GeoIpService;
  logger?: boolean;
}

function parseWindow(raw: unknown): QueryWindow {
  const value = typeof raw === 'string' && raw.length > 0 ? raw : '30s';
  return windowSchema.parse(value);
}

function zodBadRequest(error: ZodError) {
  return {
    statusCode: 400 as const,
    error: 'Bad Request',
    message: 'Validation failed',
    issues: error.issues,
  };
}

export async function buildApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const store = deps.store ?? new TrafficStore();
  const geoip = deps.geoip ?? new GeoIpService();
  const meta = deps.meta ?? new MemoryMetaStore();
  const app = Fastify({ logger: deps.logger ?? true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  const labels = (): LabelLookup => {
    const base = meta.asLabelLookup();
    return {
      getLabel: (host) => base.getLabel(host),
      getCountry: (host) => {
        const fromMeta = base.getCountry(host);
        if (fromMeta !== 'Unknown') return fromMeta;
        return geoip.lookupCountry(host);
      },
    };
  };

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send(zodBadRequest(error));
    }
    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  const healthPayload = () => {
    const geo = geoip.status;
    return {
      status: 'ok' as const,
      service: `${appName}-api`,
      version: appVersion,
      geoip: {
        configured: geo.configured,
        present: geo.present,
      },
    };
  };

  app.get('/health', async () => {
    return healthSchema.parse(healthPayload());
  });

  // Prefer /api/health via web proxy; keep root /health for local/dev.
  app.get('/api/health', async () => {
    return healthSchema.parse(healthPayload());
  });

  app.post('/api/ingest/rollups', async (request, reply) => {
    const body = rollupEnvelopeSchema.parse(request.body);
    const result = store.ingest(body);
    return reply.status(202).send({
      ok: true,
      probeId: body.probeId,
      ...result,
    });
  });

  const parseExcludeLocal = (raw: unknown): boolean => {
    if (typeof raw !== 'string') return false;
    return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
  };

  app.get('/api/dashboard', async (request) => {
    const query = request.query as { window?: string; excludeLocal?: string };
    const window = parseWindow(query.window);
    const excludeLocal = parseExcludeLocal(query.excludeLocal);
    const payload = buildDashboard(store, window, undefined, labels(), { excludeLocal });
    return dashboardSchema.parse(payload);
  });

  app.get('/api/hosts/:host', async (request) => {
    const params = request.params as { host: string };
    const query = request.query as { window?: string; excludeLocal?: string };
    const window = parseWindow(query.window);
    const excludeLocal = parseExcludeLocal(query.excludeLocal);
    const host = decodeURIComponent(params.host);
    const payload = hostSummary(store, host, window, undefined, labels(), { excludeLocal });
    return hostSummarySchema.parse(payload);
  });

  app.get('/api/hosts/:host/flows', async (request) => {
    const params = request.params as { host: string };
    const query = request.query as { window?: string; excludeLocal?: string };
    const window = parseWindow(query.window);
    const excludeLocal = parseExcludeLocal(query.excludeLocal);
    const host = decodeURIComponent(params.host);
    const payload = hostFlows(store, host, window, undefined, 50, labels(), { excludeLocal });
    return hostFlowsSchema.parse(payload);
  });

  app.put('/api/alias', async (request) => {
    const body = aliasPutSchema.parse(request.body);
    const saved = await meta.setAlias(body.host, body.alias);
    return aliasSchema.parse(saved);
  });

  app.delete('/api/alias', async (request, reply) => {
    const query = request.query as { host?: string };
    const host = typeof query.host === 'string' ? query.host.trim() : '';
    if (!host) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'host query parameter is required',
      });
    }
    const aliasCleared = await meta.clearAlias(host);
    const cacheCleared = await meta.clearCache(host);
    return { ok: true, host, aliasCleared, cacheCleared };
  });

  app.get('/api/aliases', async () => {
    return { aliases: meta.listAliases() };
  });

  app.post('/api/resolve', async (request) => {
    const body = resolveRequestSchema.parse(request.body);
    const results = await meta.resolve(body.hosts);
    return resolveResponseSchema.parse({ results });
  });

  app.get('/api/live', { websocket: true }, (socket) => {
    const unsubscribe = store.onBucket((bucket) => {
      let totalBytes = 0;
      for (const flow of bucket.flows.values()) {
        totalBytes += flow.bytesSrcToDst + flow.bytesDstToSrc;
      }
      const msg = JSON.stringify({
        type: 'tick',
        t: bucket.t,
        totalBytes,
        flowCount: bucket.flows.size,
      });
      try {
        socket.send(msg);
      } catch {
        // ignore send errors on closing sockets
      }
    });

    socket.on('close', () => {
      unsubscribe();
    });
    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const text = raw.toString();
      if (text === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    });
  });

  app.addHook('onClose', async () => {
    await meta.close();
  });

  // Expose for tests
  Object.assign(app, { trafficStore: store, metaStore: meta });
  return app;
}
