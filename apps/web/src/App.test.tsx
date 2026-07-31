import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as client from './api/client';
import { THEME_STORAGE_KEY } from './theme';

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
  fetchHost: vi.fn(async (host: string) => ({
    host,
    window: '30s',
    generatedAt: '2026-07-30T12:00:00.000Z',
    txBytes: 0,
    rxBytes: 0,
    totalBytes: 0,
    txRateBps: 0,
    rxRateBps: 0,
    topProtocols: [],
    topPeers: [],
  })),
  fetchHostFlows: vi.fn(async (host: string) => ({
    host,
    window: '30s',
    generatedAt: '2026-07-30T12:00:00.000Z',
    flows: [],
  })),
  putAlias: vi.fn(),
  resolveHosts: vi.fn(),
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    cleanup();
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    document.documentElement.removeAttribute('data-theme');
    vi.mocked(client.fetchDashboard).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the WDMBG shell and window controls', async () => {
    const { container } = renderApp();
    const view = within(container);
    expect(view.getByRole('heading', { level: 1, name: 'WDMBG' })).toBeInTheDocument();
    expect(view.getByText('Where did my bandwidth go?')).toBeInTheDocument();
    expect(view.getByText('Traffic window')).toBeInTheDocument();
    expect(view.getByRole('group', { name: 'Traffic window' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '30s' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '15m' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '1h' })).toBeInTheDocument();
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    expect(view.getAllByText(/last 30s/).length).toBeGreaterThan(0);
    expect(view.getAllByRole('columnheader', { name: 'TX Mbps' }).length).toBeGreaterThan(0);
    expect(view.getAllByRole('columnheader', { name: 'TX MB' }).length).toBeGreaterThan(0);
    expect(view.getByRole('heading', { name: 'Hot flows' })).toBeInTheDocument();
    expect(view.getByLabelText(/Drag to reorder Top talkers/i)).toBeInTheDocument();
  });

  it('opens host details from hot flow Src/Dst IPs', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Hot flows' })).toBeInTheDocument();
    });

    // Dst IP on Hot flows
    fireEvent.click(view.getByRole('button', { name: '1.1.1.1' }));
    expect(await view.findByRole('dialog', { name: /Host 1\.1\.1\.1/i })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(view.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Src IP on Hot flows (same address may also appear as talker host label)
    const srcButtons = view.getAllByRole('button', { name: '10.0.0.10' });
    expect(srcButtons.length).toBeGreaterThan(0);
    fireEvent.click(srcButtons[srcButtons.length - 1]!);
    expect(await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i })).toBeInTheDocument();

    // Talker host label still opens the same HostDialog
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(view.queryByRole('dialog')).not.toBeInTheDocument();
    });
    fireEvent.click(view.getAllByRole('button', { name: 'laptop' })[0]!);
    expect(await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
  });

  it('changes theme via select and persists preference', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('midnight');
    });

    const select = view.getByRole('combobox', { name: 'Color theme' });
    fireEvent.change(select, { target: { value: 'ocean' } });
    expect(document.documentElement.dataset.theme).toBe('ocean');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('ocean');
    expect((select as HTMLSelectElement).value).toBe('ocean');

    fireEvent.change(select, { target: { value: 'sunshower' } });
    expect(document.documentElement.dataset.theme).toBe('sunshower');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('sunshower');
  });

  it('restores stored theme preference on load', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
    const select = view.getByRole('combobox', { name: 'Color theme' }) as HTMLSelectElement;
    expect(select.value).toBe('light');
  });

  it('normalizes legacy dark storage to midnight', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('midnight');
    });
    expect((view.getByRole('combobox', { name: 'Color theme' }) as HTMLSelectElement).value).toBe(
      'midnight',
    );
  });

  it('pauses dashboard refetching and shows paused state', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    const callsAfterMount = vi.mocked(client.fetchDashboard).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    fireEvent.click(view.getByRole('button', { name: 'Pause updates' }));
    expect(view.getByText('Paused')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Resume updates' })).toBeInTheDocument();

    // Live interval is 2s; wait past a few ticks with real timers while paused.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(vi.mocked(client.fetchDashboard).mock.calls.length).toBe(callsAfterMount);

    fireEvent.click(view.getByRole('button', { name: 'Resume updates' }));
    expect(view.queryByText('Paused')).not.toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Pause updates' })).toBeInTheDocument();
  });
});
