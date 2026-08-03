import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import * as client from './api/client';
import { RESOLVE_NAME_KEY, resetAutoResolveStateForTests } from './autoResolve';
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
  fetchHealth: vi.fn(async () => ({
    status: 'ok',
    service: 'wdmbg-api',
    version: '0.0.0',
    geoip: { configured: false, present: false },
  })),
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
        srcLabel: 'laptop',
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
    topPeers:
      host === '10.0.0.10'
        ? [
            {
              host: '1.1.1.1',
              label: 'cloudflare',
              txBytes: 100,
              rxBytes: 200,
              totalBytes: 300,
              country: 'Unknown',
            },
          ]
        : [],
  })),
  fetchHostFlows: vi.fn(async (host: string) => ({
    host,
    window: '30s',
    generatedAt: '2026-07-30T12:00:00.000Z',
    flows:
      host === '10.0.0.10'
        ? [
            {
              src: '10.0.0.10',
              srcPort: 40000,
              dst: '8.8.8.8',
              dstPort: 53,
              l4: 'udp',
              l7: 'dns',
              bytes: 120,
              packets: 2,
              txBytes: 40,
              rxBytes: 80,
              srcLabel: 'laptop',
            },
          ]
        : [],
  })),
  putAlias: vi.fn(),
  clearAlias: vi.fn(),
  resolveHosts: vi.fn(async (hosts: string[]) => ({
    results: hosts.map((host) => ({
      host,
      hostname: `name-${host}`,
      source: 'dns' as const,
    })),
  })),
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
    resetAutoResolveStateForTests();
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
    window.history.replaceState({}, '', '/');
    document.documentElement.removeAttribute('data-theme');
    vi.mocked(client.fetchDashboard).mockClear();
    vi.mocked(client.resolveHosts).mockClear();
    vi.mocked(client.fetchHealth).mockImplementation(async () => ({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
      geoip: { configured: false, present: false },
    }));
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
    expect(view.getAllByRole('columnheader', { name: /TX Mbps/ }).length).toBeGreaterThan(0);
    expect(view.getAllByRole('columnheader', { name: /TX MB/ }).length).toBeGreaterThan(0);
    expect(view.getByRole('heading', { name: 'Hot flows' })).toBeInTheDocument();
    expect(view.getByLabelText(/Drag to reorder Top talkers/i)).toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top traffic by country' })).not.toBeInTheDocument();
    expect(view.queryByRole('columnheader', { name: 'Country' })).not.toBeInTheDocument();
    expect(view.getByText('sha-dev')).toBeInTheDocument();
  });

  it('opens host details from hot flow Src/Dst IPs and deep-links', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Hot flows' })).toBeInTheDocument();
    });

    fireEvent.click(view.getByRole('button', { name: '1.1.1.1' }));
    expect(await view.findByRole('dialog', { name: /Host 1\.1\.1\.1/i })).toBeInTheDocument();
    expect(window.location.search).toContain('ip=1.1.1.1');
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(view.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(window.location.search).not.toContain('ip=');

    const srcButtons = view.getAllByRole('button', { name: /10\.0\.0\.10/ });
    expect(srcButtons.length).toBeGreaterThan(0);
    fireEvent.click(srcButtons[srcButtons.length - 1]!);
    expect(await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i })).toBeInTheDocument();

    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(view.queryByRole('dialog')).not.toBeInTheDocument();
    });
    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    expect(await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
  });

  it('switches HostDialog when clicking peer or flow host inside the dialog', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    expect(await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i })).toBeInTheDocument();
    expect(window.location.search).toContain('ip=10.0.0.10');

    fireEvent.click(await view.findByRole('button', { name: /cloudflare \(1\.1\.1\.1\)/ }));
    expect(await view.findByRole('dialog', { name: /Host 1\.1\.1\.1/i })).toBeInTheDocument();
    expect(window.location.search).toContain('ip=1.1.1.1');

    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    expect(await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i })).toBeInTheDocument();
    fireEvent.click(await view.findByRole('button', { name: '8.8.8.8' }));
    expect(await view.findByRole('dialog', { name: /Host 8\.8\.8\.8/i })).toBeInTheDocument();
    expect(window.location.search).toContain('ip=8.8.8.8');
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

  it('pauses dashboard refetching via Display Refresh and shows paused state', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    const callsAfterMount = vi.mocked(client.fetchDashboard).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    const refresh = view.getByRole('combobox', { name: 'Display Refresh' });
    fireEvent.change(refresh, { target: { value: 'pause' } });
    expect(view.getByText('Paused')).toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.displayRefresh')).toBe('pause');

    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(vi.mocked(client.fetchDashboard).mock.calls.length).toBe(callsAfterMount);

    fireEvent.change(refresh, { target: { value: '5s' } });
    expect(view.queryByText('Paused')).not.toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.displayRefresh')).toBe('5s');
  });

  it('toggles Local Traffic and requests excludeLocal', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    const toggle = view.getByRole('button', { name: 'Local Traffic Shown' });
    fireEvent.click(toggle);
    expect(view.getByRole('button', { name: 'Local Traffic Hidden' })).toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.localTraffic')).toBe('hidden');
    await waitFor(() => {
      expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[1] === true)).toBe(true);
    });
  });

  it('defaults Resolve Name to Disabled and does not auto-resolve', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    expect(view.getByRole('button', { name: 'Resolve Name Disabled' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(vi.mocked(client.resolveHosts)).not.toHaveBeenCalled();
  });

  it('auto-resolves unnamed dashboard IPs when Resolve Name is Auto and persists', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    fireEvent.click(view.getByRole('button', { name: 'Resolve Name Disabled' }));
    expect(view.getByRole('button', { name: 'Resolve Name Auto' })).toBeInTheDocument();
    expect(localStorage.getItem(RESOLVE_NAME_KEY)).toBe('auto');

    await waitFor(
      () => {
        expect(vi.mocked(client.resolveHosts)).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    const resolved = vi.mocked(client.resolveHosts).mock.calls.flatMap((c) => c[0] as string[]);
    expect(resolved).toContain('1.1.1.1');
    expect(resolved).not.toContain('10.0.0.10');
  });

  it('restores Resolve Name Auto preference on load', async () => {
    localStorage.setItem(RESOLVE_NAME_KEY, 'auto');
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('button', { name: 'Resolve Name Auto' })).toBeInTheDocument();
    });
    await waitFor(
      () => {
        expect(vi.mocked(client.resolveHosts)).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  it('shows Top traffic by country only when geoip present', async () => {
    vi.mocked(client.fetchHealth).mockResolvedValue({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
      geoip: { configured: true, present: true },
    });
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top traffic by country' })).toBeInTheDocument();
    });
  });

  it('hides Country columns when geoip is not present', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    expect(view.queryByRole('heading', { name: 'Top traffic by country' })).not.toBeInTheDocument();
    expect(view.queryByRole('columnheader', { name: 'Country' })).not.toBeInTheDocument();

    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    const dialog = await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i });
    await waitFor(() => {
      expect(within(dialog).getByRole('heading', { name: 'Top peers' })).toBeInTheDocument();
    });
    expect(within(dialog).queryByRole('columnheader', { name: 'Country' })).not.toBeInTheDocument();
  });

  it('shows Country columns when geoip is present', async () => {
    vi.mocked(client.fetchHealth).mockResolvedValue({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
      geoip: { configured: true, present: true },
    });
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(view.getAllByRole('columnheader', { name: 'Country' }).length).toBeGreaterThanOrEqual(
        2,
      );
    });
    expect(view.getByRole('heading', { name: 'Top traffic by country' })).toBeInTheDocument();

    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    const dialog = await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i });
    await waitFor(() => {
      expect(within(dialog).getByRole('columnheader', { name: 'Country' })).toBeInTheDocument();
    });
  });
});
