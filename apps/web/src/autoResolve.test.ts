import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import {
  NEGATIVE_CACHE_TTL_MS,
  RESOLVE_NAME_KEY,
  collectUnnamedFromDashboard,
  loadResolveNameMode,
  needsName,
  queueAutoResolve,
  resetAutoResolveStateForTests,
} from './autoResolve';
import type { Dashboard } from '@wdmbg/contracts';

vi.mock('./api/client', () => ({
  resolveHosts: vi.fn(),
}));

function emptyDash(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    window: '1h',
    generatedAt: '2026-07-30T12:00:00.000Z',
    topTalkers: [],
    topReceivers: [],
    topLocalTalkers: [],
    topLocalReceivers: [],
    topProtocols: [],
    topCountries: [],
    hotFlows: [],
    summary: {
      local: { txBytes: 0, rxBytes: 0, totalBytes: 0 },
      internet: { txBytes: 0, rxBytes: 0, totalBytes: 0 },
    },
    ...overrides,
  };
}

describe('autoResolve', () => {
  beforeEach(() => {
    resetAutoResolveStateForTests();
    vi.useFakeTimers();
    vi.mocked(client.resolveHosts).mockReset();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    resetAutoResolveStateForTests();
    vi.useRealTimers();
  });

  it('defaults resolve name mode to auto when unset', () => {
    expect(loadResolveNameMode()).toBe('auto');
    localStorage.setItem(RESOLVE_NAME_KEY, 'disabled');
    expect(loadResolveNameMode()).toBe('disabled');
    localStorage.setItem(RESOLVE_NAME_KEY, 'auto');
    expect(loadResolveNameMode()).toBe('auto');
  });

  it('needsName is true only when label missing', () => {
    expect(needsName('1.1.1.1')).toBe(true);
    expect(needsName('1.1.1.1', null)).toBe(true);
    expect(needsName('1.1.1.1', '  ')).toBe(true);
    expect(needsName('1.1.1.1', 'cloudflare')).toBe(false);
    expect(needsName('')).toBe(false);
  });

  it('collectUnnamedFromDashboard skips labeled hosts', () => {
    const ips = collectUnnamedFromDashboard(
      emptyDash({
        topTalkers: [
          {
            host: '1.1.1.1',
            txBytes: 1,
            rxBytes: 0,
            totalBytes: 1,
            country: 'Unknown',
          },
          {
            host: '10.0.0.1',
            label: 'router',
            txBytes: 2,
            rxBytes: 0,
            totalBytes: 2,
            country: 'Local',
          },
        ],
      }),
    );
    expect(ips).toEqual(['1.1.1.1']);
  });

  it('does not permanent-ban successful resolves; re-queues when still unlabeled after TTL of negative only', async () => {
    vi.mocked(client.resolveHosts).mockResolvedValue({
      results: [{ host: '1.1.1.1', hostname: 'one.one.one.one', source: 'ptr' }],
    });

    const onResolved = vi.fn();
    queueAutoResolve(['1.1.1.1'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    await Promise.resolve();

    expect(client.resolveHosts).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledTimes(1);

    // Still unlabeled (e.g. cache expired server-side) — may re-resolve immediately
    // because success is not negatively cached.
    queueAutoResolve(['1.1.1.1'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    await Promise.resolve();

    expect(client.resolveHosts).toHaveBeenCalledTimes(2);
  });

  it('negative-caches null hostname and retries after TTL', async () => {
    vi.mocked(client.resolveHosts)
      .mockResolvedValueOnce({
        results: [{ host: '8.8.8.8', hostname: null, source: 'none' }],
      })
      .mockResolvedValueOnce({
        results: [{ host: '8.8.8.8', hostname: 'dns.google', source: 'ptr' }],
      });

    const onResolved = vi.fn();
    queueAutoResolve(['8.8.8.8'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.resolveHosts).toHaveBeenCalledTimes(1);

    // Within negative TTL — skipped
    queueAutoResolve(['8.8.8.8'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    expect(client.resolveHosts).toHaveBeenCalledTimes(1);

    // After negative TTL — allowed again
    await vi.advanceTimersByTimeAsync(NEGATIVE_CACHE_TTL_MS + 1);
    queueAutoResolve(['8.8.8.8'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.resolveHosts).toHaveBeenCalledTimes(2);
  });

  it('negative-caches network errors and backs off', async () => {
    vi.mocked(client.resolveHosts).mockRejectedValueOnce(new Error('network'));

    const onResolved = vi.fn();
    queueAutoResolve(['9.9.9.9'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.resolveHosts).toHaveBeenCalledTimes(1);
    expect(onResolved).not.toHaveBeenCalled();

    queueAutoResolve(['9.9.9.9'], onResolved);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
    expect(client.resolveHosts).toHaveBeenCalledTimes(1);
  });
});
