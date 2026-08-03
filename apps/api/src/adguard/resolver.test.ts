import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdGuardClient } from './client.js';
import {
  AdGuardNameResolver,
  adguardConfigFromEnv,
  createAdGuardNameProviderFromEnv,
} from './resolver.js';
import { MemoryMetaStore } from '../meta/store.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(handlers: Record<string, unknown | (() => unknown)>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [path, payload] of Object.entries(handlers)) {
      if (url.includes(path)) {
        const body = typeof payload === 'function' ? (payload as () => unknown)() : payload;
        if (body instanceof Error) throw body;
        if (typeof body === 'object' && body && 'status' in body && 'body' in body) {
          const typed = body as { status: number; body: unknown };
          return jsonResponse(typed.body, typed.status);
        }
        return jsonResponse(body);
      }
    }
    return jsonResponse({ error: 'not found' }, 404);
  }) as unknown as typeof fetch;
}

describe('AdGuardNameResolver precedence', () => {
  const resolvers: AdGuardNameResolver[] = [];
  afterEach(() => {
    for (const r of resolvers) r.close();
    resolvers.length = 0;
  });

  function makeResolver(handlers: Record<string, unknown>): AdGuardNameResolver {
    const client = new AdGuardClient({
      baseUrl: 'http://adguard.lan',
      username: 'u',
      password: 'p',
      timeoutMs: 500,
      fetchImpl: mockFetch(handlers),
    });
    const resolver = new AdGuardNameResolver({
      client,
      refreshMs: 60_000,
      warmOnStart: false,
    });
    resolvers.push(resolver);
    return resolver;
  }

  it('prefers rewrite over dhcp over client', async () => {
    const resolver = makeResolver({
      '/control/rewrite/list': [{ domain: 'from-rewrite', answer: '10.0.0.5' }],
      '/control/dhcp/status': {
        leases: [{ ip: '10.0.0.5', hostname: 'from-dhcp' }],
        static_leases: [],
      },
      '/control/clients': {
        clients: [{ name: 'from-client', ids: ['10.0.0.5'] }],
        auto_clients: [],
      },
    });

    await expect(resolver.lookup('10.0.0.5')).resolves.toEqual({
      hostname: 'from-rewrite',
      source: 'adguard-rewrite',
    });
  });

  it('falls through rewrite miss to dhcp then client', async () => {
    const resolver = makeResolver({
      '/control/rewrite/list': [],
      '/control/dhcp/status': {
        leases: [{ ip: '10.0.0.6', hostname: 'lease-host' }],
        static_leases: [],
      },
      '/control/clients': {
        clients: [{ name: 'client-host', ids: ['10.0.0.7'] }],
        auto_clients: [],
      },
    });

    await expect(resolver.lookup('10.0.0.6')).resolves.toEqual({
      hostname: 'lease-host',
      source: 'adguard-dhcp',
    });
    await expect(resolver.lookup('10.0.0.7')).resolves.toEqual({
      hostname: 'client-host',
      source: 'adguard-client',
    });
    await expect(resolver.lookup('10.0.0.8')).resolves.toBeNull();
  });

  it('degrades gracefully when endpoints fail', async () => {
    const resolver = makeResolver({
      '/control/rewrite/list': new Error('network down'),
      '/control/dhcp/status': { status: 500, body: { message: 'nope' } },
      '/control/clients': new Error('boom'),
    });
    await expect(resolver.lookup('10.0.0.1')).resolves.toBeNull();
  });

  it('picks stable shortest rewrite name', async () => {
    const resolver = makeResolver({
      '/control/rewrite/list': [
        { domain: 'very-long-name.lan', answer: '10.0.0.9' },
        { domain: 'short.lan', answer: '10.0.0.9' },
      ],
      '/control/dhcp/status': { leases: [], static_leases: [] },
      '/control/clients': { clients: [], auto_clients: [] },
    });
    await expect(resolver.lookup('10.0.0.9')).resolves.toEqual({
      hostname: 'short.lan',
      source: 'adguard-rewrite',
    });
  });
});

describe('MemoryMetaStore + AdGuard chain', () => {
  it('alias still wins over AdGuard', async () => {
    const adguard = {
      lookup: vi.fn(async () => ({ hostname: 'agh', source: 'adguard-rewrite' as const })),
      close: vi.fn(),
    };
    const meta = new MemoryMetaStore({ ptrEnabled: false, adguard });
    await meta.setAlias('10.0.0.10', 'manual-alias');
    const results = await meta.resolve(['10.0.0.10']);
    expect(results[0]).toMatchObject({ hostname: 'manual-alias', source: 'alias' });
    expect(adguard.lookup).not.toHaveBeenCalled();
  });

  it('uses AdGuard before PTR and caches hit', async () => {
    const adguard = {
      lookup: vi.fn(async (ip: string) =>
        ip === '10.0.0.11' ? { hostname: 'nas.lan', source: 'adguard-dhcp' as const } : null,
      ),
      close: vi.fn(),
    };
    const meta = new MemoryMetaStore({ ptrEnabled: false, adguard });
    const first = await meta.resolve(['10.0.0.11']);
    expect(first[0]).toMatchObject({ hostname: 'nas.lan', source: 'adguard-dhcp' });
    expect(adguard.lookup).toHaveBeenCalledTimes(1);

    const second = await meta.resolve(['10.0.0.11']);
    expect(second[0]).toMatchObject({ hostname: 'nas.lan', source: 'adguard-dhcp' });
    expect(adguard.lookup).toHaveBeenCalledTimes(1);

    expect(meta.asLabelLookup().getLabel('10.0.0.11')).toBe('nas.lan');
  });

  it('skips AdGuard miss to none when PTR disabled', async () => {
    const adguard = {
      lookup: vi.fn(async () => null),
      close: vi.fn(),
    };
    const meta = new MemoryMetaStore({ ptrEnabled: false, adguard });
    const results = await meta.resolve(['10.0.0.12']);
    expect(results[0]).toMatchObject({ hostname: null, source: 'none' });
  });

  it('continues when AdGuard throws', async () => {
    const adguard = {
      lookup: vi.fn(async () => {
        throw new Error('timeout');
      }),
      close: vi.fn(),
    };
    const meta = new MemoryMetaStore({ ptrEnabled: false, adguard });
    const results = await meta.resolve(['10.0.0.13']);
    expect(results[0]).toMatchObject({ hostname: null, source: 'none' });
  });
});

describe('adguardConfigFromEnv', () => {
  it('enables when URL set unless explicitly disabled', () => {
    expect(adguardConfigFromEnv({ WDMBG_ADGUARD_URL: 'http://adguard.lan' }).enabled).toBe(true);
    expect(
      adguardConfigFromEnv({
        WDMBG_ADGUARD_URL: 'http://adguard.lan',
        WDMBG_ADGUARD_ENABLED: '0',
      }).enabled,
    ).toBe(false);
    expect(adguardConfigFromEnv({}).enabled).toBe(false);
  });

  it('createAdGuardNameProviderFromEnv returns null when disabled', () => {
    const { provider } = createAdGuardNameProviderFromEnv({});
    expect(provider).toBeNull();
  });

  it('defaults AdGuard lookup_cache TTL to 12 hours', () => {
    expect(adguardConfigFromEnv({}).cacheTtlMs).toBe(12 * 60 * 60 * 1000);
    expect(adguardConfigFromEnv({ WDMBG_ADGUARD_CACHE_TTL_MS: '600000' }).cacheTtlMs).toBe(600_000);
  });
});
