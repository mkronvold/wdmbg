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
    topLocalTalkers: [
      {
        host: '10.0.0.10',
        label: 'laptop',
        txBytes: 3_000_000,
        rxBytes: 1_500_000,
        totalBytes: 4_500_000,
        country: 'Local',
      },
    ],
    topLocalReceivers: [],
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
    summary: {
      local: { txBytes: 250_000, rxBytes: 100_000, totalBytes: 350_000 },
      internet: { txBytes: 3_000_000, rxBytes: 9_000_000, totalBytes: 12_000_000 },
    },
  })),
  fetchHost: vi.fn(async (host: string) => ({
    host,
    window: '30s',
    generatedAt: '2026-07-30T12:00:00.000Z',
    txBytes: host === '10.0.0.10' ? 1_000_000 : 0,
    rxBytes: host === '10.0.0.10' ? 2_000_000 : 0,
    totalBytes: host === '10.0.0.10' ? 3_000_000 : 0,
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
    expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    expect(view.getByText('Local')).toBeInTheDocument();
    expect(view.getByText('Internet')).toBeInTheDocument();
    expect(view.getByRole('columnheader', { name: 'TX Rate' })).toBeInTheDocument();
    expect(view.getByRole('columnheader', { name: 'RX Rate' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Top Local Talkers' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Top Local Receivers' })).toBeInTheDocument();
    // Drag handles are edit-mode only
    expect(view.queryByLabelText(/Drag to reorder Top talkers/i)).not.toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Edit layout' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Edit layout' }));
    expect(view.getByLabelText(/Drag to reorder Top talkers/i)).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Done editing layout' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Hide Top talkers' })).toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top traffic by country' })).not.toBeInTheDocument();
    expect(view.queryByRole('columnheader', { name: 'Country' })).not.toBeInTheDocument();
    expect(view.getByText('sha-dev')).toBeInTheDocument();
  });

  it('hides cards outside edit mode and restores them', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    });
    fireEvent.click(view.getByRole('button', { name: 'Edit layout' }));
    fireEvent.click(view.getByRole('button', { name: 'Hide Top protocols' }));
    expect(view.getByRole('heading', { name: 'Top protocols' }).closest('section')).toHaveClass(
      'is-hidden-card',
    );
    fireEvent.click(view.getByRole('button', { name: 'Done editing layout' }));
    expect(view.queryByRole('heading', { name: 'Top protocols' })).not.toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Edit layout' }));
    expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Show Top protocols' }));
    fireEvent.click(view.getByRole('button', { name: 'Done editing layout' }));
    expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
  });

  it('packs metric columns and marks primary text columns', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    const talkers = view.getByRole('heading', { name: 'Top talkers' }).closest('section')!;
    expect(within(talkers).getByRole('columnheader', { name: 'Host' })).toHaveClass('col-primary');
    expect(within(talkers).getByRole('columnheader', { name: 'TX MB' })).toHaveClass(
      'col-min',
      'num',
    );

    const summary = view.getByRole('heading', { name: 'Traffic summary' }).closest('section')!;
    expect(within(summary).getByRole('columnheader', { name: 'Bucket' })).toHaveClass(
      'col-primary',
    );
    expect(within(summary).getByRole('columnheader', { name: 'TX Rate' })).toHaveClass(
      'col-min',
      'num',
    );

    const protocols = view.getByRole('heading', { name: 'Top protocols' }).closest('section')!;
    expect(within(protocols).getByRole('columnheader', { name: 'Protocol' })).toHaveClass(
      'col-primary',
    );
    expect(within(protocols).getByRole('columnheader', { name: 'MB' })).toHaveClass(
      'col-min',
      'num',
    );

    const flows = view.getByRole('heading', { name: 'Hot flows' }).closest('section')!;
    expect(flows.querySelector('table')).toHaveClass('has-share-cols');
    expect(within(flows).getByRole('columnheader', { name: 'Dst' })).toHaveClass('col-share');
    expect(within(flows).getByRole('columnheader', { name: 'Src' })).toHaveClass('col-share');
    expect(within(flows).getByRole('columnheader', { name: 'SPort' })).toHaveClass(
      'col-min',
      'num',
    );
    expect(within(flows).getByRole('columnheader', { name: 'L4' })).toHaveClass('col-min');

    // Single-primary tables still mark the text column as sole absorber
    expect(talkers.querySelector('table')).toHaveClass('has-one-primary');
    expect(talkers.querySelector('table')).not.toHaveClass('has-share-cols');
  });

  it('shows HostDialog totals with metric names as column headers', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    const dialog = await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i });
    const dlg = within(dialog);
    await waitFor(() => {
      expect(dlg.getByRole('heading', { name: 'Totals' })).toBeInTheDocument();
    });
    const totalsPanel = dlg.getByRole('heading', { name: 'Totals' }).closest('section');
    expect(totalsPanel).toBeTruthy();
    const totals = within(totalsPanel as HTMLElement);
    expect(totals.getByRole('columnheader', { name: 'TX MB' })).toBeInTheDocument();
    expect(totals.getByRole('columnheader', { name: 'RX MB' })).toBeInTheDocument();
    expect(totals.getByRole('columnheader', { name: 'Total MB' })).toBeInTheDocument();
    expect(totals.getByRole('columnheader', { name: 'TX Mbps' })).toBeInTheDocument();
    expect(totals.getByRole('columnheader', { name: 'RX Mbps' })).toBeInTheDocument();
    expect(totals.queryByRole('columnheader', { name: 'Metric' })).not.toBeInTheDocument();
    expect(totals.queryByRole('columnheader', { name: 'Value' })).not.toBeInTheDocument();
  });

  it('shares leftover width between Src and Dst on host detail flows', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    const dialog = await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i });
    const dlg = within(dialog);
    await waitFor(() => {
      expect(dlg.getByRole('heading', { name: 'Flows (host-relative)' })).toBeInTheDocument();
    });
    const hostFlows = dlg
      .getByRole('heading', { name: 'Flows (host-relative)' })
      .closest('section')!;
    expect(hostFlows.querySelector('table')).toHaveClass('has-share-cols');
    expect(within(hostFlows).getByRole('columnheader', { name: 'Src' })).toHaveClass('col-share');
    expect(within(hostFlows).getByRole('columnheader', { name: 'Dst' })).toHaveClass('col-share');
    expect(within(hostFlows).getByRole('columnheader', { name: 'SPort' })).toHaveClass(
      'col-min',
      'num',
    );
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

  it('persists Traffic window selection across remount', async () => {
    const { container, unmount } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    const group = view.getByRole('group', { name: 'Traffic window' });
    fireEvent.click(within(group).getByRole('button', { name: '5m' }));
    expect(localStorage.getItem('wdmbg.trafficWindow')).toBe('5m');
    await waitFor(() => {
      expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[0] === '5m')).toBe(true);
    });

    unmount();
    vi.mocked(client.fetchDashboard).mockClear();
    const remounted = renderApp();
    const remountedView = within(remounted.container);
    await waitFor(() => {
      expect(remountedView.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[0] === '5m')).toBe(true);
    expect(
      within(remountedView.getByRole('group', { name: 'Traffic window' })).getByRole('button', {
        name: '5m',
      }),
    ).toHaveClass('primary');
  });

  it('defaults Traffic window to 30s when stored value is invalid', async () => {
    localStorage.setItem('wdmbg.trafficWindow', 'not-a-window');
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[0] === '30s')).toBe(true);
    expect(
      within(view.getByRole('group', { name: 'Traffic window' })).getByRole('button', {
        name: '30s',
      }),
    ).toHaveClass('primary');
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

  it('toggles wide cards in edit mode and persists preference', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Hot flows' })).toBeInTheDocument();
    });

    const flows = view.getByRole('heading', { name: 'Hot flows' }).closest('section')!;
    expect(flows).not.toHaveClass('is-wide-card');
    expect(
      view.queryByRole('button', { name: /Make Hot flows full width/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(view.getByRole('button', { name: 'Edit layout' }));
    const wideBtn = view.getByRole('button', { name: 'Make Hot flows full width' });
    expect(wideBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(wideBtn);

    expect(flows).toHaveClass('is-wide-card');
    expect(view.getByRole('button', { name: 'Make Hot flows normal width' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.wideCards') ?? '[]')).toEqual([
      'hotFlows',
    ]);

    fireEvent.click(view.getByRole('button', { name: 'Done editing layout' }));
    expect(flows).toHaveClass('is-wide-card');
    expect(view.queryByRole('button', { name: /Make Hot flows/i })).not.toBeInTheDocument();
  });

  it('restores wide cards from localStorage on load', async () => {
    localStorage.setItem('wdmbg.dashboard.wideCards', JSON.stringify(['topTalkers']));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    expect(view.getByRole('heading', { name: 'Top talkers' }).closest('section')).toHaveClass(
      'is-wide-card',
    );
  });

  it('persists table sort order and restores it on reload', async () => {
    const { container, unmount } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    });

    const protocols = view.getByRole('heading', { name: 'Top protocols' }).closest('section')!;
    fireEvent.click(within(protocols).getByRole('button', { name: 'Sort by Protocol' }));
    expect(within(protocols).getByRole('columnheader', { name: /Protocol/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(JSON.parse(localStorage.getItem('wdmbg.tableSort') ?? '{}')).toMatchObject({
      topProtocols: { key: 'p', dir: 'desc' },
    });

    fireEvent.click(within(protocols).getByRole('button', { name: 'Sort by Protocol' }));
    expect(within(protocols).getByRole('columnheader', { name: /Protocol/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(JSON.parse(localStorage.getItem('wdmbg.tableSort') ?? '{}')).toMatchObject({
      topProtocols: { key: 'p', dir: 'asc' },
    });

    unmount();
    const again = renderApp();
    const view2 = within(again.container);
    await waitFor(() => {
      expect(view2.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    });
    const protocols2 = view2.getByRole('heading', { name: 'Top protocols' }).closest('section')!;
    expect(within(protocols2).getByRole('columnheader', { name: /Protocol/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('persists HostDialog table sort with stable table ids', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    const dialog = await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i });
    const dlg = within(dialog);
    await waitFor(() => {
      expect(dlg.getByRole('heading', { name: 'Totals' })).toBeInTheDocument();
    });
    const totals = dlg.getByRole('heading', { name: 'Totals' }).closest('section')!;
    fireEvent.click(within(totals).getByRole('button', { name: 'Sort by TX MB' }));
    expect(JSON.parse(localStorage.getItem('wdmbg.tableSort') ?? '{}')).toMatchObject({
      'host-totals': { key: 'tx', dir: 'desc' },
    });
  });
});
