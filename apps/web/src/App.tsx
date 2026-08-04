import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CountryRow,
  FlowRow,
  ProtocolRow,
  QueryWindow,
  TalkerRow,
  TrafficBucket,
} from '@wdmbg/contracts';
import { WINDOW_SECONDS } from '@wdmbg/contracts';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { fetchDashboard, fetchHealth, liveWsUrl } from './api/client';
import {
  collectUnnamedFromDashboard,
  loadResolveNameMode,
  queueAutoResolve,
  saveResolveNameMode,
  type ResolveNameMode,
} from './autoResolve';
import { moveCardStep, reorderCards, segmentVisibleCards } from './cardOrder';
import { DataTable } from './components/DataTable';
import { formatBytes, formatMb, formatMbps, hostLabel, windowLegend } from './components/format';
import { HostDialog } from './components/HostDialog';
import { UrlCard } from './components/UrlCard';
import {
  THEME_IDS,
  THEME_LABELS,
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  type ThemeId,
} from './theme';
import {
  DEFAULT_URL_CARD_HEIGHT_REM,
  DEFAULT_URL_CARD_SCALE,
  MAX_URL_CARD_HEIGHT_REM,
  MIN_URL_CARD_HEIGHT_REM,
  clampHeightRem,
  clampRefreshSec,
  clampScale,
  filterKnownIds,
  isAllowedDashboardUrl,
  isUrlCardId,
  knownDashboardIds,
  loadUrlCards,
  mergeCardOrder,
  mintUrlCardId,
  saveUrlCards,
  type UrlCardDef,
  type UrlCardId,
} from './urlCards';

const WINDOWS: QueryWindow[] = ['5s', '30s', '5m', '15m', '30m', '1h'];

const CARD_ORDER_KEY = 'wdmbg.dashboard.cardOrder';
const HIDDEN_CARDS_KEY = 'wdmbg.dashboard.hiddenCards';
const WIDE_CARDS_KEY = 'wdmbg.dashboard.wideCards';
const SETTINGS_OPEN_KEY = 'wdmbg.dashboard.settingsOpen';
const DISPLAY_REFRESH_KEY = 'wdmbg.displayRefresh';
const LOCAL_TRAFFIC_KEY = 'wdmbg.localTraffic';
const TRAFFIC_WINDOW_KEY = 'wdmbg.trafficWindow';

const DEFAULT_CARD_ORDER = [
  'trafficSummary',
  'topTalkers',
  'topReceivers',
  'topLocalTalkers',
  'topLocalReceivers',
  'topProtocols',
  'hotFlows',
  'topCountries',
] as const;

type SummaryRow = { bucket: 'Local' | 'Internet' } & TrafficBucket;

type BuiltinCardId = (typeof DEFAULT_CARD_ORDER)[number];
type DashboardCardId = BuiltinCardId | UrlCardId;

const DISPLAY_REFRESH_OPTIONS = [
  { id: 'pause', label: 'Pause', ms: null as number | null },
  { id: '1s', label: '1s', ms: 1_000 },
  { id: '5s', label: '5s', ms: 5_000 },
  { id: '30s', label: '30s', ms: 30_000 },
  { id: '1m', label: '1m', ms: 60_000 },
  { id: '5m', label: '5m', ms: 300_000 },
  { id: '15m', label: '15m', ms: 900_000 },
] as const;

type DisplayRefreshId = (typeof DISPLAY_REFRESH_OPTIONS)[number]['id'];

function readJsonLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function loadCardOrder(urlCards: readonly UrlCardDef[]): DashboardCardId[] {
  return mergeCardOrder(
    readJsonLocal(CARD_ORDER_KEY),
    DEFAULT_CARD_ORDER,
    urlCards,
  ) as DashboardCardId[];
}

function saveCardOrder(order: DashboardCardId[]) {
  try {
    localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(order));
  } catch {
    // ignore quota / private mode
  }
}

function loadIdList(key: string, urlCards: readonly UrlCardDef[]): DashboardCardId[] {
  const known = knownDashboardIds(DEFAULT_CARD_ORDER, urlCards);
  return filterKnownIds(readJsonLocal(key), known) as DashboardCardId[];
}

/** First-run hidden cards when wdmbg.dashboard.hiddenCards is unset. */
const DEFAULT_HIDDEN_CARDS: BuiltinCardId[] = ['topLocalTalkers', 'topLocalReceivers'];

function loadHiddenCards(urlCards: readonly UrlCardDef[]): DashboardCardId[] {
  const known = knownDashboardIds(DEFAULT_CARD_ORDER, urlCards);
  const raw = readJsonLocal(HIDDEN_CARDS_KEY);
  // Missing/invalid pref only — empty [] is a saved "show all" choice.
  if (raw === null) {
    return DEFAULT_HIDDEN_CARDS.filter((id) => known.has(id)) as DashboardCardId[];
  }
  return filterKnownIds(raw, known) as DashboardCardId[];
}

function saveHiddenCards(ids: DashboardCardId[]) {
  try {
    localStorage.setItem(HIDDEN_CARDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

function loadWideCards(urlCards: readonly UrlCardDef[]): DashboardCardId[] {
  return loadIdList(WIDE_CARDS_KEY, urlCards);
}

function saveWideCards(ids: DashboardCardId[]) {
  try {
    localStorage.setItem(WIDE_CARDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

function loadDisplayRefresh(): DisplayRefreshId {
  try {
    const raw = localStorage.getItem(DISPLAY_REFRESH_KEY);
    if (raw && DISPLAY_REFRESH_OPTIONS.some((o) => o.id === raw)) {
      return raw as DisplayRefreshId;
    }
  } catch {
    // ignore
  }
  return '5s';
}

function saveDisplayRefresh(id: DisplayRefreshId) {
  try {
    localStorage.setItem(DISPLAY_REFRESH_KEY, id);
  } catch {
    // ignore
  }
}

function loadTrafficWindow(): QueryWindow {
  try {
    const raw = localStorage.getItem(TRAFFIC_WINDOW_KEY);
    if (raw && WINDOWS.includes(raw as QueryWindow)) {
      return raw as QueryWindow;
    }
  } catch {
    // ignore
  }
  return '30s';
}

function saveTrafficWindow(w: QueryWindow) {
  try {
    localStorage.setItem(TRAFFIC_WINDOW_KEY, w);
  } catch {
    // ignore
  }
}

function loadSettingsOpen(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_OPEN_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // ignore
  }
  return false;
}

function saveSettingsOpen(open: boolean) {
  try {
    localStorage.setItem(SETTINGS_OPEN_KEY, open ? '1' : '0');
  } catch {
    // ignore
  }
}

function GearIcon() {
  return (
    <svg
      className="settings-gear-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}

function loadLocalTrafficShown(): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_TRAFFIC_KEY);
    if (raw === 'hidden') return false;
    if (raw === 'shown') return true;
  } catch {
    // ignore
  }
  return true;
}

function saveLocalTrafficShown(shown: boolean) {
  try {
    localStorage.setItem(LOCAL_TRAFFIC_KEY, shown ? 'shown' : 'hidden');
  } catch {
    // ignore
  }
}

function readIpParam(): string | null {
  try {
    const ip = new URLSearchParams(globalThis.location.search).get('ip');
    return ip && ip.trim() ? ip.trim() : null;
  } catch {
    return null;
  }
}

function setIpParam(ip: string | null) {
  try {
    const url = new URL(globalThis.location.href);
    if (ip) {
      url.searchParams.set('ip', ip);
    } else {
      url.searchParams.delete('ip');
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (
      next !==
      `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`
    ) {
      globalThis.history.pushState({ ip }, '', next);
    }
  } catch {
    // ignore
  }
}

function gitShaLabel(): { short: string; href: string | null } {
  const raw = (import.meta.env.VITE_GIT_SHA as string | undefined)?.trim() || 'dev';
  const short =
    raw === 'dev' || raw.startsWith('sha-') ? raw.replace(/^sha-/, '') : raw.slice(0, 7);
  const display = short.startsWith('sha-') ? short : `sha-${short}`;
  if (!raw || raw === 'dev' || raw === 'sha-dev') {
    return { short: 'sha-dev', href: null };
  }
  const full = raw.replace(/^sha-/, '');
  return {
    short: display,
    href: `https://github.com/mkronvold/wdmbg/commit/${full}`,
  };
}

export function App() {
  const qc = useQueryClient();
  const [window, setWindow] = useState<QueryWindow>(() => loadTrafficWindow());
  const [selectedHost, setSelectedHost] = useState<string | null>(() => readIpParam());
  const [live, setLive] = useState<{ t: number; totalBytes: number; flowCount: number } | null>(
    null,
  );
  const [urlCards, setUrlCards] = useState<UrlCardDef[]>(() => loadUrlCards());
  const [cardOrder, setCardOrder] = useState<DashboardCardId[]>(() =>
    loadCardOrder(loadUrlCards()),
  );
  const [hiddenCards, setHiddenCards] = useState<DashboardCardId[]>(() =>
    loadHiddenCards(loadUrlCards()),
  );
  const [wideCards, setWideCards] = useState<DashboardCardId[]>(() =>
    loadWideCards(loadUrlCards()),
  );
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<DashboardCardId | null>(null);
  const [dragOverId, setDragOverId] = useState<DashboardCardId | null>(null);
  const [addingUrlCard, setAddingUrlCard] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addHeight, setAddHeight] = useState(String(DEFAULT_URL_CARD_HEIGHT_REM));
  const [addError, setAddError] = useState<string | null>(null);
  const [displayRefresh, setDisplayRefresh] = useState<DisplayRefreshId>(() =>
    loadDisplayRefresh(),
  );
  const [localTrafficShown, setLocalTrafficShown] = useState<boolean>(() =>
    loadLocalTrafficShown(),
  );
  const [resolveNameMode, setResolveNameMode] = useState<ResolveNameMode>(() =>
    loadResolveNameMode(),
  );
  const [theme, setTheme] = useState<ThemeId>(() => resolveInitialTheme());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => loadSettingsOpen());
  const sha = useMemo(() => gitShaLabel(), []);

  const refreshOpt =
    DISPLAY_REFRESH_OPTIONS.find((o) => o.id === displayRefresh) ?? DISPLAY_REFRESH_OPTIONS[2];
  const paused = refreshOpt.ms === null;
  const refetchInterval = refreshOpt.ms === null ? false : refreshOpt.ms;
  const excludeLocal = !localTrafficShown;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      const next = !open;
      saveSettingsOpen(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onPop = () => setSelectedHost(readIpParam());
    globalThis.addEventListener('popstate', onPop);
    return () => globalThis.removeEventListener('popstate', onPop);
  }, []);

  const selectHost = useCallback((host: string) => {
    setSelectedHost(host);
    setIpParam(host);
  }, []);

  const closeHost = useCallback(() => {
    setSelectedHost(null);
    setIpParam(null);
  }, []);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
    refetchInterval: 30_000,
  });

  const dashboard = useQuery({
    queryKey: ['dashboard', window, excludeLocal],
    queryFn: () => fetchDashboard(window, excludeLocal),
    refetchInterval,
  });

  useEffect(() => {
    if (resolveNameMode !== 'auto' || !dashboard.data || !dashboard.isSuccess) return;
    const ips = collectUnnamedFromDashboard(dashboard.data);
    queueAutoResolve(ips, async () => {
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      await qc.invalidateQueries({ queryKey: ['host'] });
      await qc.invalidateQueries({ queryKey: ['host-flows'] });
    });
  }, [resolveNameMode, dashboard.data, dashboard.isSuccess, dashboard.dataUpdatedAt, qc]);

  useEffect(() => {
    if (paused) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(liveWsUrl());
      } catch {
        retry = setTimeout(connect, 3000);
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type: string;
            t: number;
            totalBytes: number;
            flowCount: number;
          };
          if (msg.type === 'tick') {
            setLive({ t: msg.t, totalBytes: msg.totalBytes, flowCount: msg.flowCount });
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!closed) {
          retry = setTimeout(connect, 3000);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [paused]);

  const onThemeChange = useCallback((next: ThemeId) => {
    persistTheme(next);
    applyTheme(next);
    setTheme(next);
  }, []);

  const onDisplayRefreshChange = useCallback((id: DisplayRefreshId) => {
    setDisplayRefresh(id);
    saveDisplayRefresh(id);
  }, []);

  const onTrafficWindowChange = useCallback((w: QueryWindow) => {
    setWindow(w);
    saveTrafficWindow(w);
  }, []);

  const onLocalTrafficToggle = useCallback(() => {
    setLocalTrafficShown((prev) => {
      const next = !prev;
      saveLocalTrafficShown(next);
      return next;
    });
  }, []);

  const onResolveNameToggle = useCallback(() => {
    setResolveNameMode((prev) => {
      const next: ResolveNameMode = prev === 'auto' ? 'disabled' : 'auto';
      saveResolveNameMode(next);
      return next;
    });
  }, []);

  const secs = WINDOW_SECONDS[window];
  const legend = windowLegend(window);
  const geoipPresent = health.data?.geoip?.present === true;

  const onDragStart = useCallback((event: DragEvent<HTMLElement>, cardId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardId);
    setDraggingId(cardId as DashboardCardId);
  }, []);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>, cardId: string) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const targetId = cardId as DashboardCardId;
      setDragOverId(targetId);
      // Browsers often block dataTransfer.getData during dragover; use React state.
      const sourceId = draggingId;
      if (!sourceId || sourceId === targetId) return;
      setCardOrder((prev) => {
        const next = reorderCards(prev, sourceId, targetId);
        if (next === prev) return prev;
        saveCardOrder(next);
        return next;
      });
    },
    [draggingId],
  );

  const onDragLeave = useCallback((_event: DragEvent<HTMLElement>, cardId: string) => {
    setDragOverId((cur) => (cur === cardId ? null : cur));
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragOverId(null);
    setDraggingId(null);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const onToggleHidden = useCallback((cardId: DashboardCardId) => {
    setHiddenCards((prev) => {
      const set = new Set(prev);
      if (set.has(cardId)) set.delete(cardId);
      else set.add(cardId);
      const next = [...set];
      saveHiddenCards(next);
      return next;
    });
  }, []);

  const onToggleWide = useCallback((cardId: DashboardCardId) => {
    setWideCards((prev) => {
      const set = new Set(prev);
      if (set.has(cardId)) set.delete(cardId);
      else set.add(cardId);
      const next = [...set];
      saveWideCards(next);
      return next;
    });
  }, []);

  const onAddUrlCard = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const title = addTitle.trim();
      const url = addUrl.trim();
      if (!title) {
        setAddError('Title is required');
        return;
      }
      if (!isAllowedDashboardUrl(url)) {
        setAddError(
          'URL must be https://, or http:// to a LAN host (.lan, private IP, or localhost)',
        );
        return;
      }
      const heightRaw = addHeight.trim() === '' ? DEFAULT_URL_CARD_HEIGHT_REM : Number(addHeight);
      const heightRem = clampHeightRem(
        Number.isFinite(heightRaw) ? heightRaw : DEFAULT_URL_CARD_HEIGHT_REM,
      );
      const def: UrlCardDef = {
        id: mintUrlCardId(),
        title,
        url,
        ...(heightRem !== DEFAULT_URL_CARD_HEIGHT_REM ? { heightRem } : {}),
      };
      setUrlCards((prev) => {
        const next = [...prev, def];
        saveUrlCards(next);
        return next;
      });
      setCardOrder((prev) => {
        const next = [...prev, def.id];
        saveCardOrder(next);
        return next;
      });
      setAddTitle('');
      setAddUrl('');
      setAddHeight(String(DEFAULT_URL_CARD_HEIGHT_REM));
      setAddError(null);
      setAddingUrlCard(false);
    },
    [addHeight, addTitle, addUrl],
  );

  const onUpdateUrlCard = useCallback(
    (
      id: UrlCardId,
      patch: Pick<UrlCardDef, 'title' | 'url' | 'heightRem' | 'refreshSec' | 'scale'>,
    ) => {
      if (!isAllowedDashboardUrl(patch.url)) return;
      const heightRem = clampHeightRem(patch.heightRem ?? DEFAULT_URL_CARD_HEIGHT_REM);
      const refreshSec = clampRefreshSec(patch.refreshSec);
      const scale = clampScale(patch.scale);
      setUrlCards((prev) => {
        const next = prev.map((c) =>
          c.id === id
            ? {
                id,
                title: patch.title.trim(),
                url: patch.url.trim(),
                ...(heightRem !== DEFAULT_URL_CARD_HEIGHT_REM ? { heightRem } : {}),
                ...(refreshSec > 0 ? { refreshSec } : {}),
                ...(scale !== DEFAULT_URL_CARD_SCALE ? { scale } : {}),
              }
            : c,
        );
        saveUrlCards(next);
        return next;
      });
    },
    [],
  );

  const onDeleteUrlCard = useCallback((id: UrlCardId) => {
    setUrlCards((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveUrlCards(next);
      return next;
    });
    setCardOrder((prev) => {
      const next = prev.filter((cid) => cid !== id);
      saveCardOrder(next);
      return next;
    });
    setHiddenCards((prev) => {
      const next = prev.filter((cid) => cid !== id);
      saveHiddenCards(next);
      return next;
    });
    setWideCards((prev) => {
      const next = prev.filter((cid) => cid !== id);
      saveWideCards(next);
      return next;
    });
  }, []);

  const hiddenSet = useMemo(() => new Set(hiddenCards), [hiddenCards]);
  const wideSet = useMemo(() => new Set(wideCards), [wideCards]);
  const urlCardById = useMemo(() => {
    const map = new Map<UrlCardId, UrlCardDef>();
    for (const c of urlCards) map.set(c.id, c);
    return map;
  }, [urlCards]);

  const onMoveCard = useCallback(
    (cardId: DashboardCardId, direction: 'up' | 'down') => {
      setCardOrder((prev) => {
        // Step within the same visible edit-mode list DnD uses (skip unavailable cards).
        const editable = prev.filter((id) => {
          if (id === 'topCountries' && !geoipPresent) return false;
          if (isUrlCardId(id) && !urlCardById.has(id)) return false;
          return true;
        });
        const moved = moveCardStep(editable, cardId, direction);
        if (moved === editable) return prev;
        const from = editable.indexOf(cardId);
        const to = direction === 'up' ? from - 1 : from + 1;
        const neighborId = editable[to];
        if (!neighborId) return prev;
        const i = prev.indexOf(cardId);
        const j = prev.indexOf(neighborId);
        if (i < 0 || j < 0) return prev;
        const next = prev.slice();
        next[i] = neighborId;
        next[j] = cardId;
        saveCardOrder(next);
        return next;
      });
    },
    [geoipPresent, urlCardById],
  );

  // Same list DnD / ↑↓ buttons use (includes hidden cards while editing).
  const editOrderIds = useMemo(() => {
    return cardOrder.filter((id) => {
      if (id === 'topCountries' && !geoipPresent) return false;
      if (isUrlCardId(id) && !urlCardById.has(id)) return false;
      return true;
    });
  }, [cardOrder, geoipPresent, urlCardById]);

  const cardChrome = (cardId: DashboardCardId) => {
    const orderIndex = editOrderIds.indexOf(cardId);
    return {
      cardId,
      draggable: true as const,
      editMode,
      hidden: hiddenSet.has(cardId),
      onToggleHidden: () => onToggleHidden(cardId),
      wide: wideSet.has(cardId),
      onToggleWide: () => onToggleWide(cardId),
      isDragging: draggingId === cardId,
      isDragOver: dragOverId === cardId,
      onDragStart,
      onDragOver,
      onDragLeave,
      onDrop,
      onDragEnd,
      canMoveUp: orderIndex > 0,
      canMoveDown: orderIndex >= 0 && orderIndex < editOrderIds.length - 1,
      onMoveUp: () => onMoveCard(cardId, 'up'),
      onMoveDown: () => onMoveCard(cardId, 'down'),
    };
  };

  const summaryRows: SummaryRow[] | null = dashboard.data?.summary
    ? [
        { bucket: 'Local', ...dashboard.data.summary.local },
        { bucket: 'Internet', ...dashboard.data.summary.internet },
      ]
    : null;

  const builtinCards: Record<BuiltinCardId, ReactNode> = {
    trafficSummary: summaryRows ? (
      <DataTable
        key="trafficSummary"
        title="Traffic summary"
        legend={legend}
        rows={summaryRows}
        defaultSortKey="b"
        defaultSortDir="asc"
        {...cardChrome('trafficSummary')}
        columns={[
          {
            key: 'b',
            header: 'Bucket',
            width: 'primary',
            render: (r: SummaryRow) => r.bucket,
            // Keep Local before Internet (natural summary order).
            sortValue: (r: SummaryRow) => (r.bucket === 'Local' ? 0 : 1),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: SummaryRow) => formatMb(r.txBytes),
            sortValue: (r: SummaryRow) => r.txBytes,
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: SummaryRow) => formatMb(r.rxBytes),
            sortValue: (r: SummaryRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Rate',
            numeric: true,
            render: (r: SummaryRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: SummaryRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Rate',
            numeric: true,
            render: (r: SummaryRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: SummaryRow) => r.rxBytes,
          },
        ]}
      />
    ) : null,
    topTalkers: dashboard.data ? (
      <DataTable
        key="topTalkers"
        title="Top talkers"
        legend={legend}
        rows={dashboard.data.topTalkers}
        defaultSortKey="txr"
        {...cardChrome('topTalkers')}
        columns={[
          {
            key: 'h',
            header: 'Host',
            width: 'primary',
            cellClassName: 'cell-host',
            render: (r: TalkerRow) => hostLabel(r.host, r.label),
            sortValue: (r: TalkerRow) => r.label ?? r.host,
            onCellClick: (r: TalkerRow) => selectHost(r.host),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          ...(geoipPresent
            ? [
                {
                  key: 'c',
                  header: 'Country',
                  width: 'min' as const,
                  render: (r: TalkerRow) => r.country ?? '—',
                },
              ]
            : []),
        ]}
      />
    ) : null,
    topReceivers: dashboard.data ? (
      <DataTable
        key="topReceivers"
        title="Top receivers"
        legend={legend}
        rows={dashboard.data.topReceivers}
        defaultSortKey="rxr"
        {...cardChrome('topReceivers')}
        columns={[
          {
            key: 'h',
            header: 'Host',
            width: 'primary',
            cellClassName: 'cell-host',
            render: (r: TalkerRow) => hostLabel(r.host, r.label),
            sortValue: (r: TalkerRow) => r.label ?? r.host,
            onCellClick: (r: TalkerRow) => selectHost(r.host),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          ...(geoipPresent
            ? [
                {
                  key: 'c',
                  header: 'Country',
                  width: 'min' as const,
                  render: (r: TalkerRow) => r.country ?? '—',
                },
              ]
            : []),
        ]}
      />
    ) : null,
    topLocalTalkers: dashboard.data ? (
      <DataTable
        key="topLocalTalkers"
        title="Top Local Talkers"
        legend={legend}
        rows={dashboard.data.topLocalTalkers}
        defaultSortKey="txr"
        {...cardChrome('topLocalTalkers')}
        columns={[
          {
            key: 'h',
            header: 'Host',
            width: 'primary',
            cellClassName: 'cell-host',
            render: (r: TalkerRow) => hostLabel(r.host, r.label),
            sortValue: (r: TalkerRow) => r.label ?? r.host,
            onCellClick: (r: TalkerRow) => selectHost(r.host),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          ...(geoipPresent
            ? [
                {
                  key: 'c',
                  header: 'Country',
                  width: 'min' as const,
                  render: (r: TalkerRow) => r.country ?? '—',
                },
              ]
            : []),
        ]}
      />
    ) : null,
    topLocalReceivers: dashboard.data ? (
      <DataTable
        key="topLocalReceivers"
        title="Top Local Receivers"
        legend={legend}
        rows={dashboard.data.topLocalReceivers}
        defaultSortKey="rxr"
        {...cardChrome('topLocalReceivers')}
        columns={[
          {
            key: 'h',
            header: 'Host',
            width: 'primary',
            cellClassName: 'cell-host',
            render: (r: TalkerRow) => hostLabel(r.host, r.label),
            sortValue: (r: TalkerRow) => r.label ?? r.host,
            onCellClick: (r: TalkerRow) => selectHost(r.host),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          ...(geoipPresent
            ? [
                {
                  key: 'c',
                  header: 'Country',
                  width: 'min' as const,
                  render: (r: TalkerRow) => r.country ?? '—',
                },
              ]
            : []),
        ]}
      />
    ) : null,
    topProtocols: dashboard.data ? (
      <DataTable
        key="topProtocols"
        title="Top protocols"
        legend={legend}
        rows={dashboard.data.topProtocols}
        defaultSortKey="b"
        {...cardChrome('topProtocols')}
        columns={[
          {
            key: 'p',
            header: 'Protocol',
            width: 'primary',
            render: (r: ProtocolRow) => r.protocol,
          },
          {
            key: 'b',
            header: 'MB',
            numeric: true,
            render: (r: ProtocolRow) => formatMb(r.bytes),
            sortValue: (r: ProtocolRow) => r.bytes,
          },
          {
            key: 'pk',
            header: 'Packets',
            numeric: true,
            render: (r: ProtocolRow) => r.packets,
            sortValue: (r: ProtocolRow) => r.packets,
          },
        ]}
      />
    ) : null,
    hotFlows: dashboard.data ? (
      <DataTable
        key="hotFlows"
        title="Bulk flows"
        legend={legend}
        rows={dashboard.data.hotFlows}
        defaultSortKey="b"
        {...cardChrome('hotFlows')}
        columns={[
          {
            key: 'src',
            header: 'Src',
            width: 'share',
            cellClassName: 'cell-host',
            render: (r: FlowRow) => hostLabel(r.src, r.srcLabel),
            sortValue: (r: FlowRow) => r.srcLabel ?? r.src,
            onCellClick: (r: FlowRow) => selectHost(r.src),
          },
          {
            key: 'sp',
            header: 'SPort',
            numeric: true,
            render: (r: FlowRow) => r.srcPort,
            sortValue: (r: FlowRow) => r.srcPort,
          },
          {
            key: 'dst',
            header: 'Dst',
            width: 'share',
            cellClassName: 'cell-host',
            render: (r: FlowRow) => hostLabel(r.dst, r.dstLabel),
            sortValue: (r: FlowRow) => r.dstLabel ?? r.dst,
            onCellClick: (r: FlowRow) => selectHost(r.dst),
          },
          {
            key: 'dp',
            header: 'DPort',
            numeric: true,
            render: (r: FlowRow) => r.dstPort,
            sortValue: (r: FlowRow) => r.dstPort,
          },
          { key: 'l4', header: 'L4', width: 'min', render: (r: FlowRow) => r.l4 },
          { key: 'l7', header: 'L7', width: 'min', render: (r: FlowRow) => r.l7 ?? '—' },
          {
            key: 'b',
            header: 'MB',
            numeric: true,
            render: (r: FlowRow) => formatMb(r.bytes),
            sortValue: (r: FlowRow) => r.bytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: FlowRow) => formatMbps(r.txBytes ?? 0, secs),
            sortValue: (r: FlowRow) => r.txBytes ?? 0,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: FlowRow) => formatMbps(r.rxBytes ?? 0, secs),
            sortValue: (r: FlowRow) => r.rxBytes ?? 0,
          },
        ]}
      />
    ) : null,
    topCountries:
      dashboard.data && geoipPresent ? (
        <DataTable
          key="topCountries"
          title="Top traffic by country"
          legend={legend}
          rows={dashboard.data.topCountries}
          {...cardChrome('topCountries')}
          columns={[
            { key: 'c', header: 'Country', width: 'primary', render: (r: CountryRow) => r.country },
            {
              key: 'b',
              header: 'MB',
              numeric: true,
              render: (r: CountryRow) => formatMb(r.bytes),
              sortValue: (r: CountryRow) => r.bytes,
            },
          ]}
        />
      ) : null,
  };

  const renderCard = (id: DashboardCardId): ReactNode => {
    if (isUrlCardId(id)) {
      const def = urlCardById.get(id);
      if (!def) return null;
      const chrome = cardChrome(id);
      return (
        <UrlCard
          key={id}
          def={def}
          editMode={chrome.editMode}
          hidden={chrome.hidden}
          onToggleHidden={chrome.onToggleHidden}
          wide={chrome.wide}
          onToggleWide={chrome.onToggleWide}
          isDragging={chrome.isDragging}
          isDragOver={chrome.isDragOver}
          onDragStart={chrome.onDragStart}
          onDragOver={chrome.onDragOver}
          onDragLeave={chrome.onDragLeave}
          onDrop={chrome.onDrop}
          onDragEnd={chrome.onDragEnd}
          canMoveUp={chrome.canMoveUp}
          canMoveDown={chrome.canMoveDown}
          onMoveUp={chrome.onMoveUp}
          onMoveDown={chrome.onMoveDown}
          onUpdate={(patch) => onUpdateUrlCard(id, patch)}
          onDelete={() => onDeleteUrlCard(id)}
        />
      );
    }
    return builtinCards[id];
  };

  const visibleCards = cardOrder.filter((id) => {
    if (id === 'topCountries' && !geoipPresent) return false;
    if (isUrlCardId(id) && !urlCardById.has(id)) return false;
    if (!editMode && hiddenSet.has(id)) return false;
    return true;
  });

  const boardSegments = segmentVisibleCards(visibleCards, wideSet);

  return (
    <div className="app wide">
      <header className="hero">
        <div className="title-row">
          <div>
            <p className="eyebrow">Passive traffic monitor</p>
            <h1>WDMBG</h1>
            <p className="subtitle">Where did my bandwidth go?</p>
          </div>
          <button
            type="button"
            className={`settings-toggle${settingsOpen ? ' active' : ''}`}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls="settings-panel"
            onClick={toggleSettings}
          >
            <GearIcon />
          </button>
        </div>
        <div className="hero-meta">
          {settingsOpen ? (
            <div id="settings-panel" className="hero-controls">
              <div className="theme-control">
                <label className="window-label" htmlFor="theme-select">
                  Theme
                </label>
                <select
                  id="theme-select"
                  className="theme-select"
                  value={theme}
                  aria-label="Color theme"
                  onChange={(event) => onThemeChange(event.target.value as ThemeId)}
                >
                  {THEME_IDS.map((id) => (
                    <option key={id} value={id}>
                      {THEME_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="window-control">
                <label className="window-label" htmlFor="display-refresh-select">
                  Display Refresh
                </label>
                <select
                  id="display-refresh-select"
                  className="theme-select"
                  value={displayRefresh}
                  aria-label="Display Refresh"
                  onChange={(event) =>
                    onDisplayRefreshChange(event.target.value as DisplayRefreshId)
                  }
                >
                  {DISPLAY_REFRESH_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="window-control">
                <p className="window-label">Local Traffic</p>
                <button
                  type="button"
                  className={localTrafficShown ? 'primary' : 'copy-btn'}
                  aria-pressed={localTrafficShown}
                  aria-label={localTrafficShown ? 'Local Traffic Shown' : 'Local Traffic Hidden'}
                  title={localTrafficShown ? 'Local Traffic Shown' : 'Local Traffic Hidden'}
                  onClick={onLocalTrafficToggle}
                >
                  {localTrafficShown ? 'Shown' : 'Hidden'}
                </button>
              </div>
              <div className="window-control">
                <p className="window-label">Resolve Name</p>
                <button
                  type="button"
                  className={resolveNameMode === 'auto' ? 'primary' : 'copy-btn'}
                  aria-pressed={resolveNameMode === 'auto'}
                  aria-label={
                    resolveNameMode === 'auto' ? 'Resolve Name Auto' : 'Resolve Name Disabled'
                  }
                  title={resolveNameMode === 'auto' ? 'Resolve Name Auto' : 'Resolve Name Disabled'}
                  onClick={onResolveNameToggle}
                >
                  {resolveNameMode === 'auto' ? 'Auto' : 'Disabled'}
                </button>
              </div>
              <div className="window-control">
                <p className="window-label" id="traffic-window-label">
                  Traffic window
                </p>
                <div
                  className="window-toggle"
                  role="group"
                  aria-labelledby="traffic-window-label"
                  aria-label="Traffic window"
                >
                  {WINDOWS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={w === window ? 'primary' : 'copy-btn'}
                      onClick={() => onTrafficWindowChange(w)}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <p className="muted small">
            API: {health.data?.status ?? (health.isError ? 'down' : '…')}
            {paused ? (
              <>
                {' · '}
                <span className="paused-badge">Paused</span>
              </>
            ) : live ? (
              ` · live ${formatBytes(live.totalBytes)} / ${live.flowCount} flows`
            ) : (
              ''
            )}
          </p>
        </div>
      </header>

      {dashboard.isError && (
        <p className="muted">Dashboard unavailable — start the API or check the /api proxy.</p>
      )}

      {editMode && dashboard.data && (
        <div className="url-card-add-bar">
          {addingUrlCard ? (
            <form
              className="url-card-form url-card-add-form"
              onSubmit={onAddUrlCard}
              aria-label="Add URL card"
            >
              <div className="url-card-form-row">
                <label htmlFor="add-url-card-title">Title</label>
                <input
                  id="add-url-card-title"
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="url-card-form-row">
                <label htmlFor="add-url-card-url">URL</label>
                <input
                  id="add-url-card-url"
                  type="url"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://… or http://host.lan"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="url-card-form-row">
                <label htmlFor="add-url-card-height">
                  Height (rem, {MIN_URL_CARD_HEIGHT_REM}–{MAX_URL_CARD_HEIGHT_REM})
                </label>
                <input
                  id="add-url-card-height"
                  type="number"
                  min={MIN_URL_CARD_HEIGHT_REM}
                  max={MAX_URL_CARD_HEIGHT_REM}
                  step={1}
                  value={addHeight}
                  onChange={(e) => setAddHeight(e.target.value)}
                />
              </div>
              {addError ? (
                <p className="url-card-form-error" role="alert">
                  {addError}
                </p>
              ) : null}
              <div className="url-card-form-actions">
                <button type="submit" className="primary">
                  Add card
                </button>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => {
                    setAddingUrlCard(false);
                    setAddError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="primary url-card-add-btn"
              aria-label="Add URL card"
              onClick={() => {
                setAddingUrlCard(true);
                setAddError(null);
              }}
            >
              + Add URL card
            </button>
          )}
        </div>
      )}

      {dashboard.data && (
        <div className="dashboard-boards">
          {boardSegments.map((segment) =>
            segment.type === 'grid' ? (
              <div key={`grid:${segment.ids.join(',')}`} className="grid">
                {segment.ids.map((id) => renderCard(id))}
              </div>
            ) : (
              <div key={`wide:${segment.id}`} className="grid-wide">
                {renderCard(segment.id)}
              </div>
            ),
          )}
        </div>
      )}

      {selectedHost && (
        <HostDialog
          key={selectedHost}
          host={selectedHost}
          window={window}
          excludeLocal={excludeLocal}
          showCountry={geoipPresent}
          autoResolve={resolveNameMode === 'auto'}
          onSelectHost={selectHost}
          onClose={closeHost}
        />
      )}

      <footer className="app-footer">
        {sha.href ? (
          <a className="sha-link" href={sha.href} target="_blank" rel="noreferrer">
            {sha.short}
          </a>
        ) : (
          <span className="sha-link muted">{sha.short}</span>
        )}
        <button
          type="button"
          className="footer-edit-link"
          aria-pressed={editMode}
          aria-label={editMode ? 'Done editing layout' : 'Edit layout'}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
      </footer>
    </div>
  );
}
