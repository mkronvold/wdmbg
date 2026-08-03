const DEFAULT_INTERVAL_MS = 60_000;

export type VersionPayload = {
  sha: string;
};

export function localGitSha(
  envSha: string | undefined = import.meta.env.VITE_GIT_SHA as string | undefined,
): string {
  const raw = envSha?.trim();
  return raw || 'dev';
}

/** True when remote is a non-empty SHA different from the running SPA build. */
export function shouldReloadForVersion(
  localSha: string,
  remoteSha: string | null | undefined,
): boolean {
  if (typeof remoteSha !== 'string') return false;
  const remote = remoteSha.trim();
  if (!remote) return false;
  return remote !== localSha.trim();
}

export async function fetchRemoteVersionSha(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  versionUrl = '/version.json',
): Promise<string | null> {
  try {
    const separator = versionUrl.includes('?') ? '&' : '?';
    const res = await fetchImpl(`${versionUrl}${separator}t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<VersionPayload> | null;
    if (!data || typeof data.sha !== 'string') return null;
    const sha = data.sha.trim();
    return sha || null;
  } catch {
    return null;
  }
}

export type VersionWatcherOptions = {
  localSha?: string;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  reload?: () => void;
  documentRef?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  versionUrl?: string;
  /** When false, skip the immediate check (still polls + visibility). Default true. */
  checkImmediately?: boolean;
};

/**
 * Poll `/version.json` and reload once when the served web build SHA changes
 * (e.g. after GHCR autoupdate recreates the web container).
 */
export function startVersionWatcher(options: VersionWatcherOptions = {}): () => void {
  const localSha = options.localSha ?? localGitSha();
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const reload =
    options.reload ??
    (() => {
      globalThis.location.reload();
    });
  const doc = options.documentRef ?? document;
  const versionUrl = options.versionUrl ?? '/version.json';
  const checkImmediately = options.checkImmediately !== false;

  let stopped = false;
  let reloading = false;

  const check = async () => {
    if (stopped || reloading) return;
    const remote = await fetchRemoteVersionSha(fetchImpl, versionUrl);
    if (stopped || reloading) return;
    if (shouldReloadForVersion(localSha, remote)) {
      reloading = true;
      reload();
    }
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') {
      void check();
    }
  };

  const timer = globalThis.setInterval(() => {
    void check();
  }, intervalMs);
  doc.addEventListener('visibilitychange', onVisibility);

  if (checkImmediately) {
    void check();
  }

  return () => {
    stopped = true;
    globalThis.clearInterval(timer);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
