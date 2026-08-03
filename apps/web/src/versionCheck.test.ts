import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  fetchRemoteVersionSha,
  localGitSha,
  shouldReloadForVersion,
  startVersionWatcher,
} from './versionCheck';

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>): Mock {
  return vi.fn(impl);
}

describe('localGitSha', () => {
  it('trims and falls back to dev', () => {
    expect(localGitSha('abc1234')).toBe('abc1234');
    expect(localGitSha('  abc  ')).toBe('abc');
    expect(localGitSha(undefined)).toBe('dev');
    expect(localGitSha('')).toBe('dev');
    expect(localGitSha('   ')).toBe('dev');
  });
});

describe('shouldReloadForVersion', () => {
  it('does not reload when SHAs match', () => {
    expect(shouldReloadForVersion('abc1234', 'abc1234')).toBe(false);
    expect(shouldReloadForVersion(' abc ', 'abc')).toBe(false);
  });

  it('reloads when remote SHA differs', () => {
    expect(shouldReloadForVersion('oldsha1', 'newsha2')).toBe(true);
  });

  it('does not reload on missing/invalid remote', () => {
    expect(shouldReloadForVersion('abc', null)).toBe(false);
    expect(shouldReloadForVersion('abc', undefined)).toBe(false);
    expect(shouldReloadForVersion('abc', '')).toBe(false);
    expect(shouldReloadForVersion('abc', '   ')).toBe(false);
  });
});

describe('fetchRemoteVersionSha', () => {
  it('returns sha from JSON body', async () => {
    const fetchImpl = mockFetch(async () => Response.json({ sha: 'deadbeef' }, { status: 200 }));
    await expect(fetchRemoteVersionSha(fetchImpl as unknown as typeof fetch)).resolves.toBe(
      'deadbeef',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('returns null on network error, non-OK, or bad payload', async () => {
    await expect(
      fetchRemoteVersionSha(
        mockFetch(async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch,
      ),
    ).resolves.toBeNull();

    await expect(
      fetchRemoteVersionSha(
        mockFetch(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch,
      ),
    ).resolves.toBeNull();

    await expect(
      fetchRemoteVersionSha(
        mockFetch(async () =>
          Response.json({ version: 'x' }, { status: 200 }),
        ) as unknown as typeof fetch,
      ),
    ).resolves.toBeNull();

    await expect(
      fetchRemoteVersionSha(
        mockFetch(async () =>
          Response.json({ sha: '  ' }, { status: 200 }),
        ) as unknown as typeof fetch,
      ),
    ).resolves.toBeNull();
  });
});

describe('startVersionWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockDoc(visibilityState: DocumentVisibilityState = 'visible') {
    const listeners = new Map<string, Set<EventListener>>();
    const doc = {
      visibilityState,
      addEventListener: (type: string, listener: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatch(type: string) {
        for (const listener of listeners.get(type) ?? []) {
          listener(new Event(type));
        }
      },
    };
    return doc;
  }

  it('does not reload when remote SHA matches local', async () => {
    const reload = vi.fn();
    const fetchImpl = mockFetch(async () => Response.json({ sha: 'same-sha' }, { status: 200 }));
    const stop = startVersionWatcher({
      localSha: 'same-sha',
      intervalMs: 60_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      reload,
      documentRef: mockDoc(),
    });

    await vi.runOnlyPendingTimersAsync();
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('reloads once when remote SHA differs', async () => {
    const reload = vi.fn();
    const fetchImpl = mockFetch(async () => Response.json({ sha: 'new-sha' }, { status: 200 }));
    const stop = startVersionWatcher({
      localSha: 'old-sha',
      intervalMs: 60_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      reload,
      documentRef: mockDoc(),
    });

    await vi.runOnlyPendingTimersAsync();
    expect(reload).toHaveBeenCalledOnce();

    // further ticks must not reload again
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reload).toHaveBeenCalledOnce();
    stop();
  });

  it('fails soft on fetch errors (no reload)', async () => {
    const reload = vi.fn();
    const fetchImpl = mockFetch(async () => {
      throw new Error('network');
    });
    const stop = startVersionWatcher({
      localSha: 'old-sha',
      intervalMs: 1_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      reload,
      documentRef: mockDoc(),
    });

    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('checks when the tab becomes visible', async () => {
    const reload = vi.fn();
    let remote = 'old-sha';
    const fetchImpl = mockFetch(async () => Response.json({ sha: remote }, { status: 200 }));
    const doc = mockDoc('hidden');
    const stop = startVersionWatcher({
      localSha: 'old-sha',
      intervalMs: 60_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      reload,
      documentRef: doc,
      checkImmediately: false,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    remote = 'new-sha';
    doc.visibilityState = 'visible';
    doc.dispatch('visibilitychange');
    await vi.runOnlyPendingTimersAsync();
    expect(reload).toHaveBeenCalledOnce();
    stop();
  });

  it('stops polling after stop()', async () => {
    const reload = vi.fn();
    const fetchImpl = mockFetch(async () => Response.json({ sha: 'old-sha' }, { status: 200 }));
    const stop = startVersionWatcher({
      localSha: 'old-sha',
      intervalMs: 1_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      reload,
      documentRef: mockDoc(),
    });

    await vi.runOnlyPendingTimersAsync();
    const callsAfterStart = fetchImpl.mock.calls.length;
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterStart);
    expect(reload).not.toHaveBeenCalled();
  });
});
