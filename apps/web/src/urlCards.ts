/** User-added dashboard URL cards (localStorage only). */

export const URL_CARDS_KEY = 'wdmbg.dashboard.urlCards';

export const DEFAULT_URL_CARD_HEIGHT_REM = 24;
export const MIN_URL_CARD_HEIGHT_REM = 12;
export const MAX_URL_CARD_HEIGHT_REM = 80;

/** Per-card iframe auto-reload intervals (0 / omit = off). */
export const URL_CARD_REFRESH_OPTIONS = [
  { sec: 0, label: 'Off' },
  { sec: 10, label: '10s' },
  { sec: 30, label: '30s' },
  { sec: 60, label: '1m' },
  { sec: 300, label: '5m' },
  { sec: 900, label: '15m' },
] as const;

const ALLOWED_URL_CARD_REFRESH_SECS = new Set<number>(
  URL_CARD_REFRESH_OPTIONS.map((o) => o.sec).filter((s) => s > 0),
);

export type UrlCardId = `url:${string}`;

export interface UrlCardDef {
  id: UrlCardId;
  title: string;
  url: string;
  /** iframe height in rem; default 24 */
  heightRem?: number;
  /** iframe auto-reload interval in seconds; omit or 0 = off */
  refreshSec?: number;
}

export function isUrlCardId(id: string): id is UrlCardId {
  return id.startsWith('url:') && id.length > 4;
}

export function mintUrlCardId(): UrlCardId {
  return `url:${crypto.randomUUID()}`;
}

export function clampHeightRem(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_URL_CARD_HEIGHT_REM;
  const rounded = Math.round(n);
  return Math.min(MAX_URL_CARD_HEIGHT_REM, Math.max(MIN_URL_CARD_HEIGHT_REM, rounded));
}

export function resolvedHeightRem(def: Pick<UrlCardDef, 'heightRem'>): number {
  return def.heightRem === undefined ? DEFAULT_URL_CARD_HEIGHT_REM : clampHeightRem(def.heightRem);
}

/** Normalize refreshSec: only allow the fixed option set; invalid / ≤0 → 0 (off). */
export function clampRefreshSec(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const rounded = Math.round(n);
  return ALLOWED_URL_CARD_REFRESH_SECS.has(rounded) ? rounded : 0;
}

export function resolvedRefreshSec(def: Pick<UrlCardDef, 'refreshSec'>): number {
  return def.refreshSec === undefined ? 0 : clampRefreshSec(def.refreshSec);
}

/** IPv4 private / loopback ranges used for http: allowance. */
function isPrivateOrLoopbackIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Hostname policy for http: (https: always allowed with non-empty host).
 * LAN-ish: *.lan (case-insensitive), RFC1918 IPv4, localhost / 127.0.0.0/8.
 */
export function isLanIshHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  if (h === 'localhost') return true;
  if (h.endsWith('.lan')) return true;
  return isPrivateOrLoopbackIPv4(h);
}

/**
 * URL policy for dashboard embeds:
 * - https: always allowed (non-empty host)
 * - http: only LAN-ish hosts
 * - reject javascript:, data:, blob:, file:, empty host, other schemes
 */
export function isAllowedDashboardUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname;
  if (!host) return false;
  if (protocol === 'https:') return true;
  if (protocol === 'http:') return isLanIshHost(host);
  return false;
}

function parseUrlCardDef(value: unknown): UrlCardDef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.id !== 'string' || !isUrlCardId(rec.id)) return null;
  if (typeof rec.title !== 'string') return null;
  const title = rec.title.trim();
  if (!title) return null;
  if (typeof rec.url !== 'string' || !isAllowedDashboardUrl(rec.url)) return null;
  const def: UrlCardDef = {
    id: rec.id,
    title,
    url: rec.url.trim(),
  };
  if (rec.heightRem !== undefined) {
    def.heightRem = clampHeightRem(rec.heightRem);
  }
  if (rec.refreshSec !== undefined) {
    const refreshSec = clampRefreshSec(rec.refreshSec);
    if (refreshSec > 0) def.refreshSec = refreshSec;
  }
  return def;
}

export function loadUrlCards(): UrlCardDef[] {
  try {
    const raw = localStorage.getItem(URL_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: UrlCardDef[] = [];
    for (const item of parsed) {
      const def = parseUrlCardDef(item);
      if (!def || seen.has(def.id)) continue;
      seen.add(def.id);
      out.push(def);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveUrlCards(cards: UrlCardDef[]) {
  try {
    localStorage.setItem(URL_CARDS_KEY, JSON.stringify(cards));
  } catch {
    // ignore quota / private mode
  }
}

/** Known id set for order/hidden/wide loaders: builtins + current url card ids. */
export function knownDashboardIds(
  builtinIds: readonly string[],
  urlCards: readonly UrlCardDef[],
): Set<string> {
  const known = new Set<string>(builtinIds);
  for (const c of urlCards) known.add(c.id);
  return known;
}

/**
 * Merge stored card order with builtins + url card ids.
 * - Keeps stored order for known ids only (drops orphan url:* and unknown builtins)
 * - Appends missing builtins (DEFAULT order)
 * - Appends missing url cards in urlCards array order
 */
export function mergeCardOrder(
  stored: unknown,
  builtinIds: readonly string[],
  urlCards: readonly UrlCardDef[],
): string[] {
  const known = knownDashboardIds(builtinIds, urlCards);
  const seen = new Set<string>();
  const ordered: string[] = [];

  if (Array.isArray(stored)) {
    for (const id of stored) {
      if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
  }

  for (const id of builtinIds) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  for (const c of urlCards) {
    if (!seen.has(c.id)) {
      ordered.push(c.id);
      seen.add(c.id);
    }
  }

  return ordered;
}

/** Filter stored id lists to known dashboard ids only (no orphans). */
export function filterKnownIds(stored: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of stored) {
    if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}
