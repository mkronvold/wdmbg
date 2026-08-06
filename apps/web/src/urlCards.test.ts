import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SPEEDIFY_URL_CARD,
  DEFAULT_SPEEDIFY_URL_CARD_ID,
  DEFAULT_URL_CARD_HEIGHT_REM,
  DEFAULT_URL_CARD_SCALE,
  DEFAULT_URL_CARDS,
  MAX_URL_CARD_HEIGHT_REM,
  MIN_URL_CARD_HEIGHT_REM,
  URL_CARDS_KEY,
  URL_CARD_REFRESH_OPTIONS,
  URL_CARD_SCALE_OPTIONS,
  clampHeightRem,
  clampRefreshSec,
  clampScale,
  factoryDefaultUrlCards,
  filterKnownIds,
  isAllowedDashboardUrl,
  isLanIshHost,
  isUrlCardId,
  loadUrlCards,
  mergeCardOrder,
  mintUrlCardId,
  resolvedHeightRem,
  resolvedRefreshSec,
  resolvedScale,
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

describe('clampRefreshSec / resolvedRefreshSec', () => {
  it('defaults Off for missing, zero, or invalid values', () => {
    expect(clampRefreshSec(undefined)).toBe(0);
    expect(clampRefreshSec(null)).toBe(0);
    expect(clampRefreshSec(0)).toBe(0);
    expect(clampRefreshSec(-1)).toBe(0);
    expect(clampRefreshSec(Number.NaN)).toBe(0);
    expect(clampRefreshSec('nope')).toBe(0);
    expect(clampRefreshSec(7)).toBe(0);
    expect(clampRefreshSec(45)).toBe(0);
    expect(resolvedRefreshSec({})).toBe(0);
    expect(resolvedRefreshSec({ refreshSec: 0 })).toBe(0);
  });

  it('accepts only the fixed option set', () => {
    const allowed = URL_CARD_REFRESH_OPTIONS.map((o) => o.sec).filter((s) => s > 0);
    expect(allowed).toEqual([10, 30, 60, 300, 900]);
    for (const sec of allowed) {
      expect(clampRefreshSec(sec)).toBe(sec);
      expect(resolvedRefreshSec({ refreshSec: sec })).toBe(sec);
    }
  });
});

describe('clampScale / resolvedScale', () => {
  it('defaults to 1 for missing or invalid values', () => {
    expect(clampScale(undefined)).toBe(DEFAULT_URL_CARD_SCALE);
    expect(clampScale(null)).toBe(DEFAULT_URL_CARD_SCALE);
    expect(clampScale(Number.NaN)).toBe(DEFAULT_URL_CARD_SCALE);
    expect(clampScale('nope')).toBe(DEFAULT_URL_CARD_SCALE);
    expect(clampScale(0.6)).toBe(DEFAULT_URL_CARD_SCALE);
    expect(clampScale(2)).toBe(DEFAULT_URL_CARD_SCALE);
    expect(clampScale(0)).toBe(DEFAULT_URL_CARD_SCALE);
    expect(resolvedScale({})).toBe(DEFAULT_URL_CARD_SCALE);
    expect(resolvedScale({ scale: 1 })).toBe(1);
  });

  it('accepts only the fixed preset set', () => {
    const allowed = URL_CARD_SCALE_OPTIONS.map((o) => o.scale);
    expect(allowed).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
    for (const scale of allowed) {
      expect(clampScale(scale)).toBe(scale);
      expect(resolvedScale({ scale })).toBe(scale);
    }
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

  it('returns factory Speedify card when missing or invalid', () => {
    expect(loadUrlCards()).toEqual(factoryDefaultUrlCards());
    expect(loadUrlCards()[0]).toEqual(DEFAULT_SPEEDIFY_URL_CARD);
    expect(DEFAULT_URL_CARDS[0]?.id).toBe(DEFAULT_SPEEDIFY_URL_CARD_ID);
    localStorage.setItem(URL_CARDS_KEY, '{');
    expect(loadUrlCards()).toEqual(factoryDefaultUrlCards());
    localStorage.setItem(URL_CARDS_KEY, '"x"');
    expect(loadUrlCards()).toEqual(factoryDefaultUrlCards());
  });

  it('respects a saved empty urlCards list', () => {
    localStorage.setItem(URL_CARDS_KEY, '[]');
    expect(loadUrlCards()).toEqual([]);
  });

  it('round-trips valid defs and drops invalid / duplicate ids', () => {
    const good: UrlCardDef = {
      id: 'url:11111111-1111-1111-1111-111111111111',
      title: 'Grafana',
      url: 'https://grafana.example.com',
      heightRem: 30,
      refreshSec: 60,
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

  it('parses refreshSec and defaults Off when omitted or invalid', () => {
    localStorage.setItem(
      URL_CARDS_KEY,
      JSON.stringify([
        {
          id: 'url:off',
          title: 'Off default',
          url: 'https://example.com/off',
        },
        {
          id: 'url:zero',
          title: 'Zero',
          url: 'https://example.com/zero',
          refreshSec: 0,
        },
        {
          id: 'url:ok',
          title: 'Ok',
          url: 'https://example.com/ok',
          refreshSec: 300,
        },
        {
          id: 'url:bad',
          title: 'Bad',
          url: 'https://example.com/bad',
          refreshSec: 17,
        },
      ]),
    );
    const loaded = loadUrlCards();
    expect(loaded).toHaveLength(4);
    expect(loaded[0]).toEqual({
      id: 'url:off',
      title: 'Off default',
      url: 'https://example.com/off',
    });
    expect(loaded[0]).not.toHaveProperty('refreshSec');
    expect(loaded[1]).toEqual({
      id: 'url:zero',
      title: 'Zero',
      url: 'https://example.com/zero',
    });
    expect(loaded[1]).not.toHaveProperty('refreshSec');
    expect(loaded[2]).toEqual({
      id: 'url:ok',
      title: 'Ok',
      url: 'https://example.com/ok',
      refreshSec: 300,
    });
    expect(loaded[3]).toEqual({
      id: 'url:bad',
      title: 'Bad',
      url: 'https://example.com/bad',
    });
    expect(loaded[3]).not.toHaveProperty('refreshSec');
  });

  it('persists refreshSec only when enabled', () => {
    const withRefresh: UrlCardDef = {
      id: 'url:r',
      title: 'R',
      url: 'https://r.example',
      refreshSec: 30,
    };
    const without: UrlCardDef = {
      id: 'url:n',
      title: 'N',
      url: 'https://n.example',
    };
    saveUrlCards([withRefresh, without]);
    expect(loadUrlCards()).toEqual([withRefresh, without]);
    const raw = JSON.parse(localStorage.getItem(URL_CARDS_KEY) ?? '[]') as UrlCardDef[];
    expect(raw[0]).toMatchObject({ refreshSec: 30 });
    expect(raw[1]).not.toHaveProperty('refreshSec');
  });

  it('parses scale and defaults 100% when omitted or invalid', () => {
    localStorage.setItem(
      URL_CARDS_KEY,
      JSON.stringify([
        {
          id: 'url:default',
          title: 'Default',
          url: 'https://example.com/default',
        },
        {
          id: 'url:half',
          title: 'Half',
          url: 'https://example.com/half',
          scale: 0.5,
        },
        {
          id: 'url:full',
          title: 'Full',
          url: 'https://example.com/full',
          scale: 1,
        },
        {
          id: 'url:bad',
          title: 'Bad',
          url: 'https://example.com/bad',
          scale: 0.6,
        },
      ]),
    );
    const loaded = loadUrlCards();
    expect(loaded).toHaveLength(4);
    expect(loaded[0]).toEqual({
      id: 'url:default',
      title: 'Default',
      url: 'https://example.com/default',
    });
    expect(loaded[0]).not.toHaveProperty('scale');
    expect(loaded[1]).toEqual({
      id: 'url:half',
      title: 'Half',
      url: 'https://example.com/half',
      scale: 0.5,
    });
    expect(loaded[2]).toEqual({
      id: 'url:full',
      title: 'Full',
      url: 'https://example.com/full',
    });
    expect(loaded[2]).not.toHaveProperty('scale');
    expect(loaded[3]).toEqual({
      id: 'url:bad',
      title: 'Bad',
      url: 'https://example.com/bad',
    });
    expect(loaded[3]).not.toHaveProperty('scale');
  });

  it('persists scale only when not 100%', () => {
    const scaled: UrlCardDef = {
      id: 'url:s',
      title: 'S',
      url: 'https://s.example',
      scale: 0.75,
    };
    const plain: UrlCardDef = {
      id: 'url:p',
      title: 'P',
      url: 'https://p.example',
    };
    saveUrlCards([scaled, plain]);
    expect(loadUrlCards()).toEqual([scaled, plain]);
    const raw = JSON.parse(localStorage.getItem(URL_CARDS_KEY) ?? '[]') as UrlCardDef[];
    expect(raw[0]).toMatchObject({ scale: 0.75 });
    expect(raw[1]).not.toHaveProperty('scale');
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
