import { defaultPorts, envPort } from '@wdmbg/config';
import { buildApp } from './app.js';
import { MemoryMetaStore, type MetaStore } from './meta/store.js';
import { createPool, PostgresMetaStore } from './db/postgres.js';
import { GeoIpService } from './geoip.js';

async function main() {
  const databaseUrl = process.env.WDMBG_DATABASE_URL;
  let meta: MetaStore = new MemoryMetaStore({
    ptrEnabled: process.env.WDMBG_PTR_ENABLED !== '0',
  });

  if (databaseUrl) {
    const pool = await createPool(databaseUrl);
    const pgMeta = new PostgresMetaStore(pool, {
      ptrEnabled: process.env.WDMBG_PTR_ENABLED !== '0',
    });
    await pgMeta.warm();
    meta = pgMeta;
  }

  const app = await buildApp({
    meta,
    geoip: new GeoIpService(),
  });
  const port = envPort('WDMBG_API_PORT', defaultPorts.api);
  const host = process.env.WDMBG_API_HOST ?? '0.0.0.0';

  await app.listen({ port, host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
