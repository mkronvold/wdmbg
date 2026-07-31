import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.stubGlobal(
  'WebSocket',
  class {
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onclose: (() => void) | null = null;
    close() {}
    send() {}
  },
);

vi.mock('./api/client', () => ({
  fetchHealth: vi.fn(async () => ({ status: 'ok', service: 'wdmbg-api', version: '0.0.0' })),
  liveWsUrl: vi.fn(() => 'ws://localhost/live'),
  fetchDashboard: vi.fn(async () => ({
    window: '30s',
    generatedAt: '2026-07-30T12:00:00.000Z',
    topTalkers: [
      {
        host: '10.0.0.10',
        label: 'laptop',
        txBytes: 3_000_000,
        rxBytes: 1_500_000,
        totalBytes: 4_500_000,
        country: 'Local',
      },
    ],
    topReceivers: [],
    topProtocols: [{ protocol: 'https', bytes: 4_000_000, packets: 100 }],
    hotFlows: [
      {
        src: '10.0.0.10',
        srcPort: 40000,
        dst: '1.1.1.1',
        dstPort: 443,
        l4: 'tcp',
        l7: 'https',
        bytes: 10_000,
        packets: 12,
        txBytes: 1000,
        rxBytes: 9000,
      },
    ],
    topCountries: [{ country: 'Unknown', bytes: 9_000_000 }],
  })),
}));

describe('App', () => {
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

  it('renders the WDMBG shell and window controls', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'WDMBG' })).toBeInTheDocument();
    expect(screen.getByText('Where did my bandwidth go?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30s' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Window 30s/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'TX Mbps' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'TX MB' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Hot flows' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Drag to reorder Top talkers/i)).toBeInTheDocument();
  });
});
