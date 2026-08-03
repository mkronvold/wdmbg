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
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { fetchDashboard, fetchHealth, liveWsUrl } from './api/client';
import {
  collectUnnamedFromDashboard,
  loadResolveNameMode,
  queueAutoResolve,
  saveResolveNameMode,
  type ResolveNameMode,
} from './autoResolve';
import { reorderCards, segmentVisibleCards } from './cardOrder';
import { DataTable } from './components/DataTable';
import { formatBytes, formatMb, formatMbps, hostLabel, windowLegend } from './components/format';
import { HostDialog } from './components/HostDialog';
import {
  THEME_IDS,
  THEME_LABELS,
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  type ThemeId,
} from './theme';

const WINDOWS: QueryWindow[] = ['5s', '30s', '5m', '15m', '30m', '1h'];

const CARD_ORDER_KEY = 'wdmbg.dashboard.cardOrder';
const HIDDEN_CARDS_KEY = 'wdmbg.dashboard.hiddenCards';
const WIDE_CARDS_KEY = 'wdmbg.dashboard.wideCards';
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

type CardId = (typeof DEFAULT_CARD_ORDER)[number];

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

function loadCardOrder(): CardId[] {
  try {
    const raw = localStorage.getItem(CARD_ORDER_KEY);
    if (!raw) return [...DEFAULT_CARD_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_CARD_ORDER];
    const known = new Set<string>(DEFAULT_CARD_ORDER);
    const seen = new Set<string>();
    const ordered: CardId[] = [];
    for (const id of parsed) {
      if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
        ordered.push(id as CardId);
        seen.add(id);
      }
    }
    for (const id of DEFAULT_CARD_ORDER) {
      if (!seen.has(id)) ordered.push(id);
    }
    return ordered;
  } catch {
    return [...DEFAULT_CARD_ORDER];
  }
}

function saveCardOrder(order: CardId[]) {
  try {
    localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(order));
  } catch {
    // ignore quota / private mode
  }
}

function loadHiddenCards(): CardId[] {
  try {
    const raw = localStorage.getItem(HIDDEN_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const known = new Set<string>(DEFAULT_CARD_ORDER);
    const seen = new Set<string>();
    const hidden: CardId[] = [];
    for (const id of parsed) {
      if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
        hidden.push(id as CardId);
        seen.add(id);
      }
    }
    return hidden;
  } catch {
    return [];
  }
}

function saveHiddenCards(ids: CardId[]) {
  try {
    localStorage.setItem(HIDDEN_CARDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

function loadWideCards(): CardId[] {
  try {
    const raw = localStorage.getItem(WIDE_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const known = new Set<string>(DEFAULT_CARD_ORDER);
    const seen = new Set<string>();
    const wide: CardId[] = [];
    for (const id of parsed) {
      if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
        wide.push(id as CardId);
        seen.add(id);
      }
    }
    return wide;
  } catch {
    return [];
  }
}

function saveWideCards(ids: CardId[]) {
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
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => loadCardOrder());
  const [hiddenCards, setHiddenCards] = useState<CardId[]>(() => loadHiddenCards());
  const [wideCards, setWideCards] = useState<CardId[]>(() => loadWideCards());
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<CardId | null>(null);
  const [dragOverId, setDragOverId] = useState<CardId | null>(null);
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
  const sha = useMemo(() => gitShaLabel(), []);

  const refreshOpt =
    DISPLAY_REFRESH_OPTIONS.find((o) => o.id === displayRefresh) ?? DISPLAY_REFRESH_OPTIONS[2];
  const paused = refreshOpt.ms === null;
  const refetchInterval = refreshOpt.ms === null ? false : refreshOpt.ms;
  const excludeLocal = !localTrafficShown;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
    setDraggingId(cardId as CardId);
  }, []);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>, cardId: string) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const targetId = cardId as CardId;
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

  const onToggleHidden = useCallback((cardId: CardId) => {
    setHiddenCards((prev) => {
      const set = new Set(prev);
      if (set.has(cardId)) set.delete(cardId);
      else set.add(cardId);
      const next = DEFAULT_CARD_ORDER.filter((id) => set.has(id));
      saveHiddenCards(next);
      return next;
    });
  }, []);

  const onToggleWide = useCallback((cardId: CardId) => {
    setWideCards((prev) => {
      const set = new Set(prev);
      if (set.has(cardId)) set.delete(cardId);
      else set.add(cardId);
      const next = DEFAULT_CARD_ORDER.filter((id) => set.has(id));
      saveWideCards(next);
      return next;
    });
  }, []);

  const hiddenSet = useMemo(() => new Set(hiddenCards), [hiddenCards]);
  const wideSet = useMemo(() => new Set(wideCards), [wideCards]);

  const cardChrome = (cardId: CardId) => ({
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
  });

  const summaryRows: SummaryRow[] | null = dashboard.data?.summary
    ? [
        { bucket: 'Local', ...dashboard.data.summary.local },
        { bucket: 'Internet', ...dashboard.data.summary.internet },
      ]
    : null;

  const cards: Record<CardId, ReactNode> = {
    trafficSummary: summaryRows ? (
      <DataTable
        key="trafficSummary"
        title="Traffic summary"
        legend={legend}
        rows={summaryRows}
        {...cardChrome('trafficSummary')}
        columns={[
          {
            key: 'b',
            header: 'Bucket',
            width: 'primary',
            render: (r: SummaryRow) => r.bucket,
            sortValue: (r: SummaryRow) => r.bucket,
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
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: TalkerRow) => r.txBytes,
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
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
            sortValue: (r: TalkerRow) => r.txBytes,
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
            sortValue: (r: TalkerRow) => r.rxBytes,
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
            sortValue: (r: TalkerRow) => r.txBytes,
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
        title="Hot flows"
        legend={legend}
        rows={dashboard.data.hotFlows}
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

  const visibleCards = cardOrder.filter((id) => {
    if (id === 'topCountries' && !geoipPresent) return false;
    if (!editMode && hiddenSet.has(id)) return false;
    return true;
  });

  const boardSegments = segmentVisibleCards(visibleCards, wideSet);

  return (
    <div className="app wide">
      <header className="hero">
        <div>
          <p className="eyebrow">Passive traffic monitor</p>
          <h1>WDMBG</h1>
          <p className="subtitle">Where did my bandwidth go?</p>
        </div>
        <div className="hero-meta">
          <div className="hero-controls">
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
                onChange={(event) => onDisplayRefreshChange(event.target.value as DisplayRefreshId)}
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

      {dashboard.data && (
        <div className="dashboard-boards">
          {boardSegments.map((segment) =>
            segment.type === 'grid' ? (
              <div key={`grid:${segment.ids.join(',')}`} className="grid">
                {segment.ids.map((id) => cards[id])}
              </div>
            ) : (
              <div key={`wide:${segment.id}`} className="grid-wide">
                {cards[segment.id]}
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
