import { useQuery } from '@tanstack/react-query';
import type { CountryRow, FlowRow, ProtocolRow, QueryWindow, TalkerRow } from '@wdmbg/contracts';
import { WINDOW_SECONDS } from '@wdmbg/contracts';
import { useCallback, useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { fetchDashboard, fetchHealth, liveWsUrl } from './api/client';
import { DataTable } from './components/DataTable';
import { formatBytes, formatMb, formatMbps, windowLegend } from './components/format';
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

const DEFAULT_CARD_ORDER = [
  'topTalkers',
  'topReceivers',
  'topProtocols',
  'hotFlows',
  'topCountries',
] as const;

type CardId = (typeof DEFAULT_CARD_ORDER)[number];

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

export function App() {
  const [window, setWindow] = useState<QueryWindow>('30s');
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [live, setLive] = useState<{ t: number; totalBytes: number; flowCount: number } | null>(
    null,
  );
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => loadCardOrder());
  const [draggingId, setDraggingId] = useState<CardId | null>(null);
  const [dragOverId, setDragOverId] = useState<CardId | null>(null);
  const [paused, setPaused] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
    refetchInterval: 30_000,
  });

  const dashboard = useQuery({
    queryKey: ['dashboard', window],
    queryFn: () => fetchDashboard(window),
    refetchInterval: paused ? false : 2_000,
  });

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

  const selectHost = useCallback((host: string) => {
    setSelectedHost(host);
  }, []);

  const onThemeChange = useCallback((next: ThemeId) => {
    persistTheme(next);
    applyTheme(next);
    setTheme(next);
  }, []);

  const secs = WINDOW_SECONDS[window];
  const legend = windowLegend(window);

  const onDragStart = useCallback((event: DragEvent<HTMLElement>, cardId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardId);
    setDraggingId(cardId as CardId);
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>, cardId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverId(cardId as CardId);
  }, []);

  const onDragLeave = useCallback((_event: DragEvent<HTMLElement>, cardId: string) => {
    setDragOverId((cur) => (cur === cardId ? null : cur));
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetId: string) => {
      event.preventDefault();
      const sourceId = (event.dataTransfer.getData('text/plain') || draggingId) as CardId | null;
      setDragOverId(null);
      setDraggingId(null);
      if (!sourceId || sourceId === targetId) return;
      setCardOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(sourceId);
        const to = next.indexOf(targetId as CardId);
        if (from < 0 || to < 0) return prev;
        next.splice(from, 1);
        next.splice(to, 0, sourceId);
        saveCardOrder(next);
        return next;
      });
    },
    [draggingId],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const dragProps = {
    draggable: true as const,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  };

  const cards: Record<CardId, ReactNode> = {
    topTalkers: dashboard.data ? (
      <DataTable
        key="topTalkers"
        cardId="topTalkers"
        title="Top talkers"
        legend={legend}
        rows={dashboard.data.topTalkers}
        isDragging={draggingId === 'topTalkers'}
        isDragOver={dragOverId === 'topTalkers'}
        {...dragProps}
        columns={[
          {
            key: 'h',
            header: 'Host',
            cellClassName: 'cell-host',
            render: (r: TalkerRow) => r.label ?? r.host,
            onCellClick: (r: TalkerRow) => selectHost(r.host),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
          },
          { key: 'c', header: 'Country', render: (r: TalkerRow) => r.country ?? '—' },
        ]}
      />
    ) : null,
    topReceivers: dashboard.data ? (
      <DataTable
        key="topReceivers"
        cardId="topReceivers"
        title="Top receivers"
        legend={legend}
        rows={dashboard.data.topReceivers}
        isDragging={draggingId === 'topReceivers'}
        isDragOver={dragOverId === 'topReceivers'}
        {...dragProps}
        columns={[
          {
            key: 'h',
            header: 'Host',
            cellClassName: 'cell-host',
            render: (r: TalkerRow) => r.label ?? r.host,
            onCellClick: (r: TalkerRow) => selectHost(r.host),
          },
          {
            key: 'rx',
            header: 'RX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.rxBytes),
          },
          {
            key: 'tx',
            header: 'TX MB',
            numeric: true,
            render: (r: TalkerRow) => formatMb(r.txBytes),
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.rxBytes, secs),
          },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: TalkerRow) => formatMbps(r.txBytes, secs),
          },
          { key: 'c', header: 'Country', render: (r: TalkerRow) => r.country ?? '—' },
        ]}
      />
    ) : null,
    topProtocols: dashboard.data ? (
      <DataTable
        key="topProtocols"
        cardId="topProtocols"
        title="Top protocols"
        legend={legend}
        rows={dashboard.data.topProtocols}
        isDragging={draggingId === 'topProtocols'}
        isDragOver={dragOverId === 'topProtocols'}
        {...dragProps}
        columns={[
          { key: 'p', header: 'Protocol', render: (r: ProtocolRow) => r.protocol },
          { key: 'b', header: 'MB', numeric: true, render: (r: ProtocolRow) => formatMb(r.bytes) },
          { key: 'pk', header: 'Packets', numeric: true, render: (r: ProtocolRow) => r.packets },
        ]}
      />
    ) : null,
    hotFlows: dashboard.data ? (
      <DataTable
        key="hotFlows"
        cardId="hotFlows"
        title="Hot flows"
        legend={legend}
        rows={dashboard.data.hotFlows}
        isDragging={draggingId === 'hotFlows'}
        isDragOver={dragOverId === 'hotFlows'}
        {...dragProps}
        columns={[
          {
            key: 'src',
            header: 'Src',
            cellClassName: 'cell-host',
            render: (r: FlowRow) => r.src,
            onCellClick: (r: FlowRow) => selectHost(r.src),
          },
          { key: 'sp', header: 'SPort', numeric: true, render: (r: FlowRow) => r.srcPort },
          {
            key: 'dst',
            header: 'Dst',
            cellClassName: 'cell-host',
            render: (r: FlowRow) => r.dst,
            onCellClick: (r: FlowRow) => selectHost(r.dst),
          },
          { key: 'dp', header: 'DPort', numeric: true, render: (r: FlowRow) => r.dstPort },
          { key: 'l4', header: 'L4', render: (r: FlowRow) => r.l4 },
          { key: 'l7', header: 'L7', render: (r: FlowRow) => r.l7 ?? '—' },
          { key: 'b', header: 'MB', numeric: true, render: (r: FlowRow) => formatMb(r.bytes) },
          {
            key: 'txr',
            header: 'TX Mbps',
            numeric: true,
            render: (r: FlowRow) => formatMbps(r.txBytes ?? 0, secs),
          },
          {
            key: 'rxr',
            header: 'RX Mbps',
            numeric: true,
            render: (r: FlowRow) => formatMbps(r.rxBytes ?? 0, secs),
          },
        ]}
      />
    ) : null,
    topCountries: dashboard.data ? (
      <DataTable
        key="topCountries"
        cardId="topCountries"
        title="Top traffic by country"
        legend={legend}
        rows={dashboard.data.topCountries}
        isDragging={draggingId === 'topCountries'}
        isDragOver={dragOverId === 'topCountries'}
        {...dragProps}
        columns={[
          { key: 'c', header: 'Country', render: (r: CountryRow) => r.country },
          { key: 'b', header: 'MB', numeric: true, render: (r: CountryRow) => formatMb(r.bytes) },
        ]}
      />
    ) : null,
  };

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
            <button
              type="button"
              className="copy-btn icon-btn"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume updates' : 'Pause updates'}
              title={paused ? 'Resume updates' : 'Pause updates'}
            >
              {paused ? '▶' : '⏸'}
            </button>
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
                    onClick={() => setWindow(w)}
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

      {dashboard.data && <div className="grid">{cardOrder.map((id) => cards[id])}</div>}

      {selectedHost && (
        <HostDialog host={selectedHost} window={window} onClose={() => setSelectedHost(null)} />
      )}
    </div>
  );
}
