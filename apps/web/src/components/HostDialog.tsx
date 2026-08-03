import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlowRow, ProtocolRow, QueryWindow, TalkerRow } from '@wdmbg/contracts';
import { WINDOW_SECONDS } from '@wdmbg/contracts';
import { useEffect, useState } from 'react';
import { clearAlias, fetchHost, fetchHostFlows, putAlias, resolveHosts } from '../api/client';
import { collectUnnamedFromHost, queueAutoResolve } from '../autoResolve';
import { DataTable } from './DataTable';
import { formatMb, formatMbps, hostLabel, windowLegend } from './format';

export interface HostDialogProps {
  host: string;
  window: QueryWindow;
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

export function HostDialog({
  host,
  window,
  excludeLocal = false,
  showCountry = false,
  autoResolve = false,
  onSelectHost,
  onClose,
}: HostDialogProps) {
  const qc = useQueryClient();
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasHost, setAliasHost] = useState(host);
  const secs = WINDOW_SECONDS[window];
  const legend = windowLegend(window);

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
  });
  const flows = useQuery({
    queryKey: ['host-flows', host, window, excludeLocal],
    queryFn: () => fetchHostFlows(host, window, excludeLocal),
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
            tableId="host-totals"
            legend={legend}
            rows={totals}
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
