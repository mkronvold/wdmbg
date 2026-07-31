import { useQuery } from '@tanstack/react-query';
import type { QueryWindow, TalkerRow } from '@wdmbg/contracts';
import { useEffect, useMemo, useState } from 'react';
import { fetchDashboard, fetchHealth, liveWsUrl } from './api/client';
import { DataTable } from './components/DataTable';
import { formatBytes } from './components/format';
import { HostDialog } from './components/HostDialog';

const WINDOWS: QueryWindow[] = ['5s', '30s', '5m'];

export function App() {
  const [window, setWindow] = useState<QueryWindow>('30s');
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [live, setLive] = useState<{ t: number; totalBytes: number; flowCount: number } | null>(
    null,
  );

  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
    refetchInterval: 30_000,
  });

  const dashboard = useQuery({
    queryKey: ['dashboard', window],
    queryFn: () => fetchDashboard(window),
    refetchInterval: 2_000,
  });

  useEffect(() => {
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
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  const openHost = useMemo(() => {
    return (row: TalkerRow) => setSelectedHost(row.host);
  }, []);

  return (
    <div className="app wide">
      <header className="hero">
        <div>
          <p className="eyebrow">Passive traffic monitor</p>
          <h1>WDMBG</h1>
          <p className="subtitle">Where did my bandwidth go?</p>
        </div>
        <div className="hero-meta">
          <div className="window-toggle" role="group" aria-label="Time window">
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
          <p className="muted small">
            API: {health.data?.status ?? (health.isError ? 'down' : '…')}
            {live ? ` · live ${formatBytes(live.totalBytes)} / ${live.flowCount} flows` : ''}
          </p>
        </div>
      </header>

      {dashboard.isError && (
        <p className="muted">Dashboard unavailable — start the API or check the /api proxy.</p>
      )}

      {dashboard.data && (
        <div className="grid">
          <DataTable
            title="Top talkers"
            rows={dashboard.data.topTalkers}
            columns={[
              {
                key: 'h',
                header: 'Host',
                render: (r) => r.label ?? r.host,
                onCellClick: openHost,
              },
              { key: 'tx', header: 'TX', render: (r) => formatBytes(r.txBytes) },
              { key: 'rx', header: 'RX', render: (r) => formatBytes(r.rxBytes) },
              { key: 'c', header: 'Country', render: (r) => r.country ?? '—' },
            ]}
          />
          <DataTable
            title="Top receivers"
            rows={dashboard.data.topReceivers}
            columns={[
              {
                key: 'h',
                header: 'Host',
                render: (r) => r.label ?? r.host,
                onCellClick: openHost,
              },
              { key: 'rx', header: 'RX', render: (r) => formatBytes(r.rxBytes) },
              { key: 'tx', header: 'TX', render: (r) => formatBytes(r.txBytes) },
              { key: 'c', header: 'Country', render: (r) => r.country ?? '—' },
            ]}
          />
          <DataTable
            title="Top protocols"
            rows={dashboard.data.topProtocols}
            columns={[
              { key: 'p', header: 'Protocol', render: (r) => r.protocol },
              { key: 'b', header: 'Bytes', render: (r) => formatBytes(r.bytes) },
              { key: 'pk', header: 'Packets', render: (r) => r.packets },
            ]}
          />
          <DataTable
            title="Hot flows"
            rows={dashboard.data.hotFlows}
            columns={[
              { key: 'src', header: 'Src', render: (r) => r.src },
              { key: 'sp', header: 'SPort', render: (r) => r.srcPort },
              { key: 'dst', header: 'Dst', render: (r) => r.dst },
              { key: 'dp', header: 'DPort', render: (r) => r.dstPort },
              { key: 'l4', header: 'L4', render: (r) => r.l4 },
              { key: 'l7', header: 'L7', render: (r) => r.l7 ?? '—' },
              { key: 'b', header: 'Bytes', render: (r) => formatBytes(r.bytes) },
            ]}
          />
          <DataTable
            title="Top traffic by country"
            rows={dashboard.data.topCountries}
            columns={[
              { key: 'c', header: 'Country', render: (r) => r.country },
              { key: 'b', header: 'Bytes', render: (r) => formatBytes(r.bytes) },
            ]}
          />
        </div>
      )}

      {selectedHost && (
        <HostDialog host={selectedHost} window={window} onClose={() => setSelectedHost(null)} />
      )}
    </div>
  );
}
