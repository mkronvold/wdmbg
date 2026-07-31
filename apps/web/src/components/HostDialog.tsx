import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlowRow, ProtocolRow, QueryWindow, TalkerRow } from '@wdmbg/contracts';
import { WINDOW_SECONDS } from '@wdmbg/contracts';
import { useState } from 'react';
import { fetchHost, fetchHostFlows, putAlias, resolveHosts } from '../api/client';
import { DataTable } from './DataTable';
import { formatMb, formatMbps, hostLabel, windowLegend } from './format';

export interface HostDialogProps {
  host: string;
  window: QueryWindow;
  onClose: () => void;
}

export function HostDialog({ host, window, onClose }: HostDialogProps) {
  const qc = useQueryClient();
  const [aliasDraft, setAliasDraft] = useState('');
  const secs = WINDOW_SECONDS[window];
  const legend = windowLegend(window);

  const summary = useQuery({
    queryKey: ['host', host, window],
    queryFn: () => fetchHost(host, window),
  });
  const flows = useQuery({
    queryKey: ['host-flows', host, window],
    queryFn: () => fetchHostFlows(host, window),
  });

  const aliasMut = useMutation({
    mutationFn: () => putAlias(host, aliasDraft.trim()),
    onSuccess: async () => {
      setAliasDraft('');
      await qc.invalidateQueries({ queryKey: ['host', host] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveHosts([host]),
  });

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
        {summary.data && (
          <dl className="status compact">
            <div>
              <dt>TX MB</dt>
              <dd>{formatMb(summary.data.txBytes)}</dd>
            </div>
            <div>
              <dt>RX MB</dt>
              <dd>{formatMb(summary.data.rxBytes)}</dd>
            </div>
            <div>
              <dt>Total MB</dt>
              <dd>{formatMb(summary.data.totalBytes)}</dd>
            </div>
            <div>
              <dt>TX Mbps</dt>
              <dd>{formatMbps(summary.data.txBytes, secs)}</dd>
            </div>
            <div>
              <dt>RX Mbps</dt>
              <dd>{formatMbps(summary.data.rxBytes, secs)}</dd>
            </div>
          </dl>
        )}

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
          <button type="button" className="copy-btn" onClick={() => resolveMut.mutate()}>
            Resolve PTR
          </button>
        </div>
        {resolveMut.data?.results[0] && (
          <p className="muted">
            Resolve: {resolveMut.data.results[0].hostname ?? '—'} (
            {resolveMut.data.results[0].source})
          </p>
        )}

        {summary.data && (
          <DataTable
            title="Top protocols"
            legend={legend}
            rows={summary.data.topProtocols}
            columns={[
              { key: 'p', header: 'Protocol', render: (r: ProtocolRow) => r.protocol },
              { key: 'b', header: 'MB', numeric: true, render: (r: ProtocolRow) => formatMb(r.bytes) },
              {
                key: 'pk',
                header: 'Packets',
                numeric: true,
                render: (r: ProtocolRow) => r.packets,
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
                render: (r: FlowRow) => r.src,
              },
              { key: 'sp', header: 'SPort', numeric: true, render: (r: FlowRow) => r.srcPort },
              {
                key: 'dst',
                header: 'Dst',
                cellClassName: 'cell-host',
                render: (r: FlowRow) => r.dst,
              },
              { key: 'dp', header: 'DPort', numeric: true, render: (r: FlowRow) => r.dstPort },
              { key: 'l4', header: 'L4', render: (r: FlowRow) => r.l4 },
              { key: 'l7', header: 'L7', render: (r: FlowRow) => r.l7 ?? '—' },
              {
                key: 'tx',
                header: 'TX MB',
                numeric: true,
                render: (r: FlowRow) => formatMb(r.txBytes ?? 0),
              },
              {
                key: 'rx',
                header: 'RX MB',
                numeric: true,
                render: (r: FlowRow) => formatMb(r.rxBytes ?? 0),
              },
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
        )}
      </div>
    </div>
  );
}
