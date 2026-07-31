import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('GET /health', () => {
  const appPromise = buildApp();

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns ok', async () => {
    const app = await appPromise;
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'wdmbg-api',
    });
  });
});
