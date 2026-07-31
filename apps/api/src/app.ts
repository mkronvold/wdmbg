import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appName, appVersion } from '@wdmbg/config';
import { healthSchema } from '@wdmbg/contracts';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/health', async () => {
    const payload = {
      status: 'ok' as const,
      service: `${appName}-api`,
      version: appVersion,
    };
    return healthSchema.parse(payload);
  });

  return app;
}
