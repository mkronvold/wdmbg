import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlowRow, ProtocolRow, QueryWindow, TalkerRow } from '@wdmbg/contracts';
import { WINDOW_SECONDS } from '@wdmbg/contracts';
import { useEffect, useState } from 'react';
import { clearAlias, fetchHost, fetchHostFlows, putAlias, resolveHosts } from '../api/client';
import { collectUnnamedFromHost, queueAutoResolve } from '../autoResolve';
import {
  DISPLAY_REFRESH_OPTIONS,
  WINDOWS,
  VISUALIZATION_OPTIONS,
  displayRefreshInterval,
  type DisplayRefreshId,
  type VisualizationMode,
} from '../displayPrefs';
import { DataTable } from './DataTable';
import { formatMb, formatMbps, hostLabel, windowLegend } from './format';

export interface HostDialogProps {
  host: string;
  /** Dashboard traffic window — seed only for dialog-local window state */
  initialWindow: QueryWindow;
  /** Dashboard display refresh id — seed only */
  initialDisplayRefresh: DisplayRefreshId;
  visualization: VisualizationMode;
  onVisualizationChange: (mode: VisualizationMode) => void;
  excludeLocal?: boolean;
  /** When false, omit Country column (GeoIP DB not present). */
  showCountry?: boolean;
  /** When true, automatically resolve unnamed host/peer/flow IPs. */
  autoResolve?: boolean;
  /** Open/switch detailed view to another host (updates parent + ?ip=). */
  onSelectHost?: (host: string) => void;
  onClose: () => void;
}

type TotalsRow = {
  txBytes: number;
  rxBytes: number;
  totalBytes: number;
};

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

export function HostDialog({
  host,
  initialWindow,
  initialDisplayRefresh,
  visualization,
  onVisualizationChange,
  excludeLocal = false,
  showCountry = false,
  autoResolve = false,
  onSelectHost,
  onClose,
}: HostDialogProps) {
  const qc = useQueryClient();
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasHost, setAliasHost] = useState(host);
  // Seed once from dashboard on open; peer navigation must not reset these.
  const [window, setWindow] = useState<QueryWindow>(initialWindow);
  const [displayRefresh, setDisplayRefresh] = useState<DisplayRefreshId>(initialDisplayRefresh);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const secs = WINDOW_SECONDS[window];
  const legend = windowLegend(window);
  const refetchInterval = displayRefreshInterval(displayRefresh);
  const paused = refetchInterval === false;
  const tableVisualization = visualization === 'off' ? undefined : visualization;

  // Reset draft when the selected host changes (prefer render-time adjust over effect).
  if (aliasHost !== host) {
    setAliasHost(host);
    setAliasDraft('');
  }

  const selectHost = (next: string) => {
    onSelectHost?.(next);
  };

  const summary = useQuery({
    queryKey: ['host', host, window, excludeLocal],
    queryFn: () => fetchHost(host, window, excludeLocal),
    refetchInterval,
  });
  const flows = useQuery({
    queryKey: ['host-flows', host, window, excludeLocal],
    queryFn: () => fetchHostFlows(host, window, excludeLocal),
    refetchInterval,
  });

  useEffect(() => {
    if (!autoResolve) return;
    if (!summary.isSuccess && !flows.isSuccess) return;
    const ips = collectUnnamedFromHost(host, summary.data, flows.data);
    queueAutoResolve(ips, async () => {
      await qc.invalidateQueries({ queryKey: ['host', host] });
      await qc.invalidateQueries({ queryKey: ['host-flows', host] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    });
  }, [
    autoResolve,
    host,
    summary.data,
    summary.isSuccess,
    summary.dataUpdatedAt,
    flows.data,
    flows.isSuccess,
    flows.dataUpdatedAt,
    qc,
  ]);

  const aliasMut = useMutation({
    mutationFn: () => putAlias(host, aliasDraft.trim()),
    onSuccess: async () => {
      setAliasDraft('');
      await qc.invalidateQueries({ queryKey: ['host', host] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const clearMut = useMutation({
    mutationFn: () => clearAlias(host),
    onSuccess: async () => {
      setAliasDraft('');
      await qc.invalidateQueries({ queryKey: ['host', host] });
      await qc.invalidateQueries({ queryKey: ['host-flows', host] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveHosts([host]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['host', host] });
      await qc.invalidateQueries({ queryKey: ['host-flows', host] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const totals: TotalsRow[] | null = summary.data
    ? [
        {
          txBytes: summary.data.txBytes,
          rxBytes: summary.data.rxBytes,
          totalBytes: summary.data.totalBytes,
        },
      ]
    : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Host ${host}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <div className="panel-title-block">
            <h2>{hostLabel(host, summary.data?.label)}</h2>
            <p className="panel-legend">
              {legend}
              {paused ? (
                <>
                  {' · '}
                  <span className="paused-badge">Paused</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="panel-head-actions">
            <button
              type="button"
              className={`settings-toggle${settingsOpen ? ' active' : ''}`}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              aria-controls="host-settings-panel"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <GearIcon />
            </button>
            <button type="button" className="copy-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {settingsOpen ? (
          <div id="host-settings-panel" className="hero-controls host-settings-controls">
            <div className="window-control">
              <p className="window-label" id="host-visualization-label">
                Visualization
              </p>
              <div
                className="window-toggle"
                role="group"
                aria-labelledby="host-visualization-label"
                aria-label="Visualization"
              >
                {VISUALIZATION_OPTIONS.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={mode === visualization ? 'primary' : 'copy-btn'}
                    aria-pressed={mode === visualization}
                    onClick={() => onVisualizationChange(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="window-control">
              <label className="window-label" htmlFor="host-display-refresh-select">
                Display Refresh
              </label>
              <select
                id="host-display-refresh-select"
                className="theme-select"
                value={displayRefresh}
                aria-label="Display Refresh"
                onChange={(event) => setDisplayRefresh(event.target.value as DisplayRefreshId)}
              >
                {DISPLAY_REFRESH_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="window-control">
              <p className="window-label" id="host-traffic-window-label">
                Traffic window
              </p>
              <div
                className="window-toggle"
                role="group"
                aria-labelledby="host-traffic-window-label"
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
        ) : null}

        {summary.isLoading && <p className="muted">Loading host…</p>}

        {totals && (
          <DataTable
            title="Totals"
            tableId="host-totals"
            legend={legend}
            rows={totals}
            visualization={tableVisualization}
            columns={[
              {
                key: 'tx',
                header: 'TX MB',
                numeric: true,
                render: (r: TotalsRow) => formatMb(r.txBytes),
                sortValue: (r: TotalsRow) => r.txBytes,
              },
              {
                key: 'rx',
                header: 'RX MB',
                numeric: true,
                render: (r: TotalsRow) => formatMb(r.rxBytes),
                sortValue: (r: TotalsRow) => r.rxBytes,
              },
              {
                key: 'tot',
                header: 'Total MB',
                numeric: true,
                render: (r: TotalsRow) => formatMb(r.totalBytes),
                sortValue: (r: TotalsRow) => r.totalBytes,
              },
              {
                key: 'txr',
                header: 'TX Mbps',
                numeric: true,
                render: (r: TotalsRow) => formatMbps(r.txBytes, secs),
                sortValue: (r: TotalsRow) => r.txBytes,
              },
              {
                key: 'rxr',
                header: 'RX Mbps',
                numeric: true,
                render: (r: TotalsRow) => formatMbps(r.rxBytes, secs),
                sortValue: (r: TotalsRow) => r.rxBytes,
              },
            ]}
          />
        )}

        {summary.data && (
          <DataTable
            title="Top protocols"
            tableId="host-protocols"
            legend={legend}
            rows={summary.data.topProtocols}
            defaultSortKey="b"
            visualization={tableVisualization}
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
        )}
        {summary.data && (
          <DataTable
            title="Top peers"
            tableId="host-peers"
            legend={legend}
            rows={summary.data.topPeers}
            defaultSortKey="rx"
            visualization={tableVisualization}
            columns={[
              {
                key: 'h',
                header: 'Peer',
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
              ...(showCountry
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
        )}
        {flows.data && (
          <DataTable
            title="Flows (host-relative)"
            tableId="host-flows"
            legend={legend}
            rows={flows.data.flows}
            defaultSortKey="rxr"
            visualization={tableVisualization}
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
                key: 'tx',
                header: 'TX MB',
                numeric: true,
                render: (r: FlowRow) => formatMb(r.txBytes ?? 0),
                sortValue: (r: FlowRow) => r.txBytes ?? 0,
              },
              {
                key: 'rx',
                header: 'RX MB',
                numeric: true,
                render: (r: FlowRow) => formatMb(r.rxBytes ?? 0),
                sortValue: (r: FlowRow) => r.rxBytes ?? 0,
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
        )}

        <div className="alias-block">
          <p className="window-label">Alias</p>
          <div className="alias-row">
            <input
              value={aliasDraft}
              onChange={(e) => setAliasDraft(e.target.value)}
              placeholder="Persistent alias"
              aria-label="Alias"
            />
            <button
              type="button"
              className="primary"
              disabled={!aliasDraft.trim() || aliasMut.isPending}
              onClick={() => aliasMut.mutate()}
            >
              Save alias
            </button>
            <button
              type="button"
              className="copy-btn"
              disabled={clearMut.isPending}
              onClick={() => clearMut.mutate()}
            >
              Clear alias
            </button>
            <button type="button" className="copy-btn" onClick={() => resolveMut.mutate()}>
              Resolve
            </button>
          </div>
          {resolveMut.data?.results[0] && (
            <p className="muted">
              Resolve: {resolveMut.data.results[0].hostname ?? '—'} (
              {resolveMut.data.results[0].source})
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
