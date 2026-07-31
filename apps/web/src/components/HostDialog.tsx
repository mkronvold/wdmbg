import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryWindow } from '@wdmbg/contracts';
import { useState } from 'react';
import { fetchHost, fetchHostFlows, putAlias, resolveHosts } from '../api/client';
import { DataTable } from './DataTable';
import { formatBps, formatBytes, hostLabel } from './format';

export interface HostDialogProps {
  host: string;
  window: QueryWindow;
  onClose: () => void;
}

export function HostDialog({ host, window, onClose }: HostDialogProps) {
  const qc = useQueryClient();
  const [aliasDraft, setAliasDraft] = useState('');

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
          <h2>{hostLabel(host, summary.data?.label)}</h2>
          <button type="button" className="copy-btn" onClick={onClose}>
            Close
          </button>
        </div>

        {summary.isLoading && <p className="muted">Loading host…</p>}
        {summary.data && (
          <dl className="status compact">
            <div>
              <dt>TX</dt>
              <dd>
                {formatBytes(summary.data.txBytes)} ({formatBps(summary.data.txRateBps)})
              </dd>
            </div>
            <div>
              <dt>RX</dt>
              <dd>
                {formatBytes(summary.data.rxBytes)} ({formatBps(summary.data.rxRateBps)})
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatBytes(summary.data.totalBytes)}</dd>
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
            rows={summary.data.topProtocols}
            columns={[
              { key: 'p', header: 'Protocol', render: (r) => r.protocol },
              { key: 'b', header: 'Bytes', render: (r) => formatBytes(r.bytes) },
              { key: 'pk', header: 'Packets', render: (r) => r.packets },
            ]}
          />
        )}
        {summary.data && (
          <DataTable
            title="Top peers"
            rows={summary.data.topPeers}
            columns={[
              { key: 'h', header: 'Peer', render: (r) => hostLabel(r.host, r.label) },
              { key: 'tx', header: 'TX', render: (r) => formatBytes(r.txBytes) },
              { key: 'rx', header: 'RX', render: (r) => formatBytes(r.rxBytes) },
              { key: 'c', header: 'Country', render: (r) => r.country ?? '—' },
            ]}
          />
        )}
        {flows.data && (
          <DataTable
            title="Flows (host-relative)"
            rows={flows.data.flows}
            columns={[
              { key: 'src', header: 'Src', render: (r) => r.src },
              { key: 'sp', header: 'SPort', render: (r) => r.srcPort },
              { key: 'dst', header: 'Dst', render: (r) => r.dst },
              { key: 'dp', header: 'DPort', render: (r) => r.dstPort },
              { key: 'l4', header: 'L4', render: (r) => r.l4 },
              { key: 'l7', header: 'L7', render: (r) => r.l7 ?? '—' },
              { key: 'tx', header: 'TX', render: (r) => formatBytes(r.txBytes ?? 0) },
              { key: 'rx', header: 'RX', render: (r) => formatBytes(r.rxBytes ?? 0) },
            ]}
          />
        )}
      </div>
    </div>
  );
}
