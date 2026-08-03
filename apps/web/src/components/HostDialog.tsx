import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlowRow, ProtocolRow, QueryWindow, TalkerRow } from '@wdmbg/contracts';
import { WINDOW_SECONDS } from '@wdmbg/contracts';
import { useEffect, useState } from 'react';
import { clearAlias, fetchHost, fetchHostFlows, putAlias, resolveHosts } from '../api/client';
import { DataTable } from './DataTable';
import { formatMb, formatMbps, hostLabel, windowLegend } from './format';

export interface HostDialogProps {
  host: string;
  window: QueryWindow;
  excludeLocal?: boolean;
  /** Open/switch detailed view to another host (updates parent + ?ip=). */
  onSelectHost?: (host: string) => void;
  onClose: () => void;
}

type MetricRow = { metric: string; value: string };

export function HostDialog({
  host,
  window,
  excludeLocal = false,
  onSelectHost,
  onClose,
}: HostDialogProps) {
  const qc = useQueryClient();
  const [aliasDraft, setAliasDraft] = useState('');
  const secs = WINDOW_SECONDS[window];
  const legend = windowLegend(window);

  useEffect(() => {
    setAliasDraft('');
  }, [host]);

  const selectHost = (next: string) => {
    onSelectHost?.(next);
  };

  const summary = useQuery({
    queryKey: ['host', host, window, excludeLocal],
    queryFn: () => fetchHost(host, window, excludeLocal),
  });
  const flows = useQuery({
    queryKey: ['host-flows', host, window, excludeLocal],
    queryFn: () => fetchHostFlows(host, window, excludeLocal),
  });

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

  const totals: MetricRow[] | null = summary.data
    ? [
        { metric: 'TX MB', value: formatMb(summary.data.txBytes) },
        { metric: 'RX MB', value: formatMb(summary.data.rxBytes) },
        { metric: 'Total MB', value: formatMb(summary.data.totalBytes) },
        { metric: 'TX Mbps', value: formatMbps(summary.data.txBytes, secs) },
        { metric: 'RX Mbps', value: formatMbps(summary.data.rxBytes, secs) },
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
            <p className="panel-legend">{legend}</p>
          </div>
          <button type="button" className="copy-btn" onClick={onClose}>
            Close
          </button>
        </div>

        {summary.isLoading && <p className="muted">Loading host…</p>}

        {totals && (
          <DataTable
            title="Totals"
            legend={legend}
            rows={totals}
            columns={[
              { key: 'm', header: 'Metric', render: (r: MetricRow) => r.metric },
              {
                key: 'v',
                header: 'Value',
                numeric: true,
                render: (r: MetricRow) => r.value,
                sortValue: (r: MetricRow) => Number(r.value) || r.value,
              },
            ]}
          />
        )}

        {summary.data && (
          <DataTable
            title="Top protocols"
            legend={legend}
            rows={summary.data.topProtocols}
            columns={[
              { key: 'p', header: 'Protocol', render: (r: ProtocolRow) => r.protocol },
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
            legend={legend}
            rows={summary.data.topPeers}
            columns={[
              {
                key: 'h',
                header: 'Peer',
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
              {
                key: 'c',
                header: 'Country',
                render: (r: TalkerRow) => r.country ?? '—',
              },
            ]}
          />
        )}
        {flows.data && (
          <DataTable
            title="Flows (host-relative)"
            legend={legend}
            rows={flows.data.flows}
            columns={[
              {
                key: 'src',
                header: 'Src',
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
              { key: 'l4', header: 'L4', render: (r: FlowRow) => r.l4 },
              { key: 'l7', header: 'L7', render: (r: FlowRow) => r.l7 ?? '—' },
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
