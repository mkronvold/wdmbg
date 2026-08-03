import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_URL_CARD_HEIGHT_REM,
  MAX_URL_CARD_HEIGHT_REM,
  MIN_URL_CARD_HEIGHT_REM,
  URL_CARDS_KEY,
  clampHeightRem,
  filterKnownIds,
  isAllowedDashboardUrl,
  isLanIshHost,
  isUrlCardId,
  loadUrlCards,
  mergeCardOrder,
  mintUrlCardId,
  resolvedHeightRem,
  saveUrlCards,
  type UrlCardDef,
} from './urlCards';

describe('isUrlCardId', () => {
  it('accepts url: prefix with non-empty suffix', () => {
    expect(isUrlCardId('url:abc')).toBe(true);
    expect(isUrlCardId('url:550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects non-url ids and bare prefix', () => {
    expect(isUrlCardId('topTalkers')).toBe(false);
    expect(isUrlCardId('url:')).toBe(false);
    expect(isUrlCardId('URL:abc')).toBe(false);
  });
});

describe('mintUrlCardId', () => {
  it('returns url: + uuid', () => {
    const id = mintUrlCardId();
    expect(id.startsWith('url:')).toBe(true);
    expect(isUrlCardId(id)).toBe(true);
    expect(id.length).toBeGreaterThan(10);
  });
});

describe('clampHeightRem / resolvedHeightRem', () => {
  it('defaults invalid values to 24', () => {
    expect(clampHeightRem(undefined)).toBe(DEFAULT_URL_CARD_HEIGHT_REM);
    expect(clampHeightRem(Number.NaN)).toBe(DEFAULT_URL_CARD_HEIGHT_REM);
    expect(clampHeightRem('nope')).toBe(DEFAULT_URL_CARD_HEIGHT_REM);
  });

  it('clamps to 12–80', () => {
    expect(clampHeightRem(5)).toBe(MIN_URL_CARD_HEIGHT_REM);
    expect(clampHeightRem(12)).toBe(12);
    expect(clampHeightRem(40)).toBe(40);
    expect(clampHeightRem(80)).toBe(80);
    expect(clampHeightRem(120)).toBe(MAX_URL_CARD_HEIGHT_REM);
  });

  it('resolvedHeightRem uses default when omitted', () => {
    expect(resolvedHeightRem({})).toBe(DEFAULT_URL_CARD_HEIGHT_REM);
    expect(resolvedHeightRem({ heightRem: 30 })).toBe(30);
  });
});

describe('isLanIshHost', () => {
  it('allows localhost, *.lan, RFC1918, 127/8', () => {
    expect(isLanIshHost('localhost')).toBe(true);
    expect(isLanIshHost('LOCALHOST')).toBe(true);
    expect(isLanIshHost('prom.lan')).toBe(true);
    expect(isLanIshHost('Grafana.LAN')).toBe(true);
    expect(isLanIshHost('10.0.0.1')).toBe(true);
    expect(isLanIshHost('10.255.255.255')).toBe(true);
    expect(isLanIshHost('172.16.0.1')).toBe(true);
    expect(isLanIshHost('172.31.255.1')).toBe(true);
    expect(isLanIshHost('192.168.1.1')).toBe(true);
    expect(isLanIshHost('127.0.0.1')).toBe(true);
    expect(isLanIshHost('127.255.0.1')).toBe(true);
  });

  it('rejects public hosts and non-private ranges', () => {
    expect(isLanIshHost('')).toBe(false);
    expect(isLanIshHost('example.com')).toBe(false);
    expect(isLanIshHost('172.15.0.1')).toBe(false);
    expect(isLanIshHost('172.32.0.1')).toBe(false);
    expect(isLanIshHost('8.8.8.8')).toBe(false);
    expect(isLanIshHost('192.169.0.1')).toBe(false);
    expect(isLanIshHost('11.0.0.1')).toBe(false);
  });
});

describe('isAllowedDashboardUrl', () => {
  it('allows https with host', () => {
    expect(isAllowedDashboardUrl('https://example.com')).toBe(true);
    expect(isAllowedDashboardUrl('https://example.com/path?q=1')).toBe(true);
    expect(isAllowedDashboardUrl('  https://grafana.example.org/d/x  ')).toBe(true);
  });

  it('allows http only for LAN-ish hosts', () => {
    expect(isAllowedDashboardUrl('http://prom.lan')).toBe(true);
    expect(isAllowedDashboardUrl('http://10.0.0.5:3000/d/x')).toBe(true);
    expect(isAllowedDashboardUrl('http://192.168.1.10')).toBe(true);
    expect(isAllowedDashboardUrl('http://172.16.0.2')).toBe(true);
    expect(isAllowedDashboardUrl('http://localhost:8080')).toBe(true);
    expect(isAllowedDashboardUrl('http://127.0.0.1')).toBe(true);
  });

  it('rejects http to public hosts', () => {
    expect(isAllowedDashboardUrl('http://example.com')).toBe(false);
    expect(isAllowedDashboardUrl('http://8.8.8.8')).toBe(false);
  });

  it('rejects dangerous or empty schemes/hosts', () => {
    expect(isAllowedDashboardUrl('')).toBe(false);
    expect(isAllowedDashboardUrl('   ')).toBe(false);
    expect(isAllowedDashboardUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedDashboardUrl('data:text/html,hi')).toBe(false);
    expect(isAllowedDashboardUrl('blob:https://x')).toBe(false);
    expect(isAllowedDashboardUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedDashboardUrl('ftp://example.com')).toBe(false);
    expect(isAllowedDashboardUrl('https://')).toBe(false);
    expect(isAllowedDashboardUrl('not a url')).toBe(false);
  });
});

describe('loadUrlCards / saveUrlCards', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  it('returns empty when missing or invalid', () => {
    expect(loadUrlCards()).toEqual([]);
    localStorage.setItem(URL_CARDS_KEY, '{');
    expect(loadUrlCards()).toEqual([]);
    localStorage.setItem(URL_CARDS_KEY, '"x"');
    expect(loadUrlCards()).toEqual([]);
  });

  it('round-trips valid defs and drops invalid / duplicate ids', () => {
    const good: UrlCardDef = {
      id: 'url:11111111-1111-1111-1111-111111111111',
      title: 'Grafana',
      url: 'https://grafana.example.com',
      heightRem: 30,
    };
    saveUrlCards([good]);
    expect(loadUrlCards()).toEqual([good]);

    localStorage.setItem(
      URL_CARDS_KEY,
      JSON.stringify([
        good,
        { id: 'url:dup', title: 'A', url: 'https://a.example' },
        { id: 'url:dup', title: 'B', url: 'https://b.example' },
        { id: 'not-url', title: 'X', url: 'https://x.example' },
        { id: 'url:bad', title: '  ', url: 'https://x.example' },
        { id: 'url:js', title: 'JS', url: 'javascript:alert(1)' },
        { id: 'url:http-public', title: 'Pub', url: 'http://example.com' },
        { title: 'no-id', url: 'https://x.example' },
        null,
        42,
      ]),
    );
    const loaded = loadUrlCards();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual(good);
    expect(loaded[1]).toEqual({
      id: 'url:dup',
      title: 'A',
      url: 'https://a.example',
    });
  });

  it('clamps height on load', () => {
    localStorage.setItem(
      URL_CARDS_KEY,
      JSON.stringify([
        {
          id: 'url:h',
          title: 'Tall',
          url: 'https://example.com',
          heightRem: 999,
        },
      ]),
    );
    expect(loadUrlCards()[0]?.heightRem).toBe(MAX_URL_CARD_HEIGHT_REM);
  });
});

describe('mergeCardOrder / filterKnownIds', () => {
  const builtins = ['a', 'b', 'c'] as const;
  const urlCards: UrlCardDef[] = [
    { id: 'url:1', title: 'One', url: 'https://one.example' },
    { id: 'url:2', title: 'Two', url: 'https://two.example' },
  ];

  it('merges stored order, appends missing builtins and url cards', () => {
    expect(mergeCardOrder(['c', 'url:2', 'unknown', 'url:orphan'], builtins, urlCards)).toEqual([
      'c',
      'url:2',
      'a',
      'b',
      'url:1',
    ]);
  });

  it('defaults to builtins then url cards when stored missing', () => {
    expect(mergeCardOrder(null, builtins, urlCards)).toEqual(['a', 'b', 'c', 'url:1', 'url:2']);
  });

  it('filterKnownIds drops orphans', () => {
    const known = new Set(['a', 'url:1']);
    expect(filterKnownIds(['url:1', 'a', 'url:gone', 'x', 'a'], known)).toEqual(['url:1', 'a']);
    expect(filterKnownIds(null, known)).toEqual([]);
  });
});
