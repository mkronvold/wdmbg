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
      {
        host: '10.0.0.20',
        label: 'nas',
        txBytes: 7_000_000,
        rxBytes: 500_000,
        totalBytes: 7_500_000,
        country: 'Local',
      },
    ],
    topReceivers: [
      {
        host: '10.0.0.10',
        label: 'laptop',
        txBytes: 1_500_000,
        rxBytes: 3_000_000,
        totalBytes: 4_500_000,
        country: 'Local',
      },
      {
        host: '10.0.0.20',
        label: 'nas',
        txBytes: 500_000,
        rxBytes: 7_000_000,
        totalBytes: 7_500_000,
        country: 'Local',
      },
    ],
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
    topLocalReceivers: [
      {
        host: '10.0.0.10',
        label: 'laptop',
        txBytes: 1_500_000,
        rxBytes: 3_000_000,
        totalBytes: 4_500_000,
        country: 'Local',
      },
    ],
    topProtocols: [
      { protocol: 'https', bytes: 4_000_000, packets: 100 },
      { protocol: 'dns', bytes: 1_000_000, packets: 40 },
    ],
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
    topProtocols:
      host === '10.0.0.10'
        ? [
            { protocol: 'https', bytes: 2_000_000, packets: 50 },
            { protocol: 'dns', bytes: 120, packets: 2 },
          ]
        : [],
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

function openSettings(view: ReturnType<typeof within>) {
  const gear = view.getByRole('button', { name: 'Settings' });
  if (gear.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(gear);
  }
  return gear;
}

function setEditLayout(view: ReturnType<typeof within>, on: boolean) {
  if (on) {
    openSettings(view);
    const editBtn = view.queryByRole('button', { name: 'Edit Layout' });
    if (editBtn) fireEvent.click(editBtn);
    return;
  }
  const saveBtn = view.queryByRole('button', { name: 'Save Layout' });
  if (saveBtn) {
    fireEvent.click(saveBtn);
    return;
  }
  openSettings(view);
  const settingsSave = view.queryByRole('button', { name: 'Save Layout' });
  if (settingsSave) fireEvent.click(settingsSave);
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

  it('renders the WDMBG shell and factory default layout', async () => {
    const { container } = renderApp();
    const view = within(container);
    expect(view.getByRole('heading', { level: 1, name: 'WDMBG' })).toBeInTheDocument();
    expect(view.getByText('Where did my bandwidth go?')).toBeInTheDocument();
    const gear = view.getByRole('button', { name: 'Settings' });
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(view.queryByText('Traffic window')).not.toBeInTheDocument();
    // Edit Layout lives in Settings, not the footer.
    expect(view.queryByRole('button', { name: 'Edit Layout' })).not.toBeInTheDocument();
    openSettings(view);
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    expect(view.getByText('Traffic window')).toBeInTheDocument();
    expect(view.getByRole('group', { name: 'Traffic window' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '30s' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '15m' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '1h' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Reset Layout' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        view.getByRole('heading', { name: 'Top Receivers from Internet' }),
      ).toBeInTheDocument();
    });
    expect(view.getByRole('heading', { name: 'Top Talkers to Internet' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Speedify' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Bulk flows' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Bulk flows' }).closest('section')).toHaveClass(
      'is-wide-card',
    );
    expect(view.getByText('Local')).toBeInTheDocument();
    expect(view.getByText('Internet')).toBeInTheDocument();
    expect(view.getByRole('columnheader', { name: 'TX Rate' })).toBeInTheDocument();
    expect(view.getByRole('columnheader', { name: 'RX Rate' })).toBeInTheDocument();
    // Classic talker/receiver/protocol cards hidden on first load.
    expect(view.queryByRole('heading', { name: 'Top talkers' })).not.toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top receivers' })).not.toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top protocols' })).not.toBeInTheDocument();
    // Drag handles are edit-mode only
    expect(
      view.queryByLabelText('Drag to reorder Top Receivers from Internet'),
    ).not.toBeInTheDocument();
    setEditLayout(view, true);
    expect(view.getByLabelText('Drag to reorder Top Receivers from Internet')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Save Layout' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Reset Layout' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Show Top talkers' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Top talkers' }).closest('section')).toHaveClass(
      'is-hidden-card',
    );
    expect(view.getByRole('heading', { name: 'Top receivers' }).closest('section')).toHaveClass(
      'is-hidden-card',
    );
    expect(view.getByRole('heading', { name: 'Top protocols' }).closest('section')).toHaveClass(
      'is-hidden-card',
    );
    expect(view.queryByRole('heading', { name: 'Top traffic by country' })).not.toBeInTheDocument();
    expect(view.queryByRole('columnheader', { name: 'Country' })).not.toBeInTheDocument();
    expect(view.getByText('sha-dev')).toBeInTheDocument();
  });

  it('hides cards outside edit mode and restores them', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    });
    setEditLayout(view, true);
    fireEvent.click(view.getByRole('button', { name: 'Hide Top protocols' }));
    expect(view.getByRole('heading', { name: 'Top protocols' }).closest('section')).toHaveClass(
      'is-hidden-card',
    );
    setEditLayout(view, false);
    expect(view.queryByRole('heading', { name: 'Top protocols' })).not.toBeInTheDocument();
    setEditLayout(view, true);
    expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Show Top protocols' }));
    setEditLayout(view, false);
    expect(view.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
  });

  it('uses the same host metric column order on talker and receiver cards', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    // Local cards are hidden by default; reveal in edit mode for header checks.
    setEditLayout(view, true);

    const expected = ['Host', 'TX MB', 'RX MB', 'TX Mbps', 'RX Mbps'];
    for (const title of [
      'Top talkers',
      'Top receivers',
      'Top Receivers from Internet',
      'Top Talkers to Internet',
    ]) {
      const section = view.getByRole('heading', { name: title }).closest('section')!;
      const headers = within(section)
        .getAllByRole('columnheader')
        .map((el) => el.textContent?.replace(/[↑↓]/g, '').trim());
      expect(headers).toEqual(expected);
    }
  });

  it('applies default sorts when no saved table sort exists', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    setEditLayout(view, true);

    const expectSort = (
      title: string,
      header: RegExp | string,
      dir: 'ascending' | 'descending',
    ) => {
      const section = view.getByRole('heading', { name: title }).closest('section')!;
      expect(within(section).getByRole('columnheader', { name: header })).toHaveAttribute(
        'aria-sort',
        dir,
      );
    };

    expectSort('Top talkers', /TX Mbps/, 'descending');
    expectSort('Top receivers', /RX Mbps/, 'descending');
    expectSort('Top Receivers from Internet', /RX Mbps/, 'descending');
    expectSort('Top Talkers to Internet', /TX Mbps/, 'descending');
    expectSort('Top protocols', /^MB/, 'descending');
    expectSort('Bulk flows', /^MB/, 'descending');
    expectSort('Traffic summary', /Bucket/, 'ascending');

    // Defaults must not write localStorage until the user clicks a header.
    expect(localStorage.getItem('wdmbg.tableSort')).toBeNull();
  });

  it('applies factory hidden cards without writing hiddenCards', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(
        view.getByRole('heading', { name: 'Top Receivers from Internet' }),
      ).toBeInTheDocument();
    });
    expect(view.getByRole('heading', { name: 'Top Talkers to Internet' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Speedify' })).toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top talkers' })).not.toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top receivers' })).not.toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Top protocols' })).not.toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.dashboard.hiddenCards')).toBeNull();
    expect(localStorage.getItem('wdmbg.dashboard.wideCards')).toBeNull();
    expect(localStorage.getItem('wdmbg.dashboard.urlCards')).toBeNull();
    expect(view.getByRole('heading', { name: 'Bulk flows' }).closest('section')).toHaveClass(
      'is-wide-card',
    );
  });

  it('respects a saved empty hiddenCards list (show all builtins)', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(
        view.getByRole('heading', { name: 'Top Receivers from Internet' }),
      ).toBeInTheDocument();
    });
    expect(view.getByRole('heading', { name: 'Top Talkers to Internet' })).toBeInTheDocument();
  });

  it('applies HostDialog default sorts when no saved sort exists', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    fireEvent.click(view.getAllByRole('button', { name: /laptop \(10\.0\.0\.10\)/ })[0]!);
    const dialog = await view.findByRole('dialog', { name: /Host 10\.0\.0\.10/i });
    const dlg = within(dialog);
    await waitFor(() => {
      expect(dlg.getByRole('heading', { name: 'Top protocols' })).toBeInTheDocument();
    });

    const protocols = dlg.getByRole('heading', { name: 'Top protocols' }).closest('section')!;
    expect(within(protocols).getByRole('columnheader', { name: /^MB/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    const peers = dlg.getByRole('heading', { name: 'Top peers' }).closest('section')!;
    expect(
      within(peers).getByRole('columnheader', {
        name: (n) => n.replace(/[↑↓]/g, '').trim() === 'RX MB',
      }),
    ).toHaveAttribute('aria-sort', 'descending');

    await waitFor(() => {
      expect(dlg.getByRole('heading', { name: 'Flows (host-relative)' })).toBeInTheDocument();
    });
    const flows = dlg.getByRole('heading', { name: 'Flows (host-relative)' }).closest('section')!;
    expect(within(flows).getByRole('columnheader', { name: /RX Mbps/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(localStorage.getItem('wdmbg.tableSort')).toBeNull();
  });

  it('packs metric columns and marks primary text columns', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
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
    expect(within(summary).getByRole('columnheader', { name: /Bucket/ })).toHaveClass(
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
    expect(within(protocols).getByRole('columnheader', { name: /^MB/ })).toHaveClass(
      'col-min',
      'num',
    );

    const flows = view.getByRole('heading', { name: 'Bulk flows' }).closest('section')!;
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
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
      expect(view.getByRole('heading', { name: 'Bulk flows' })).toBeInTheDocument();
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
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

  it('toggles settings panel from the gear and persists open state', async () => {
    const { container } = renderApp();
    const view = within(container);
    const gear = view.getByRole('button', { name: 'Settings' });
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(view.queryByLabelText('Color theme')).not.toBeInTheDocument();
    expect(view.queryByRole('group', { name: 'Traffic window' })).not.toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Edit Layout' })).not.toBeInTheDocument();

    fireEvent.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    expect(view.getByLabelText('Color theme')).toBeInTheDocument();
    expect(view.getByRole('group', { name: 'Traffic window' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument();
    expect(view.getByRole('combobox', { name: 'Display Refresh' })).toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.dashboard.settingsOpen')).toBe('1');

    fireEvent.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(view.queryByLabelText('Color theme')).not.toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Edit Layout' })).not.toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.dashboard.settingsOpen')).toBe('0');
  });

  it('exits edit mode via header Save Layout when settings are closed', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });

    setEditLayout(view, true);
    expect(view.getByLabelText('Drag to reorder Top Receivers from Internet')).toBeInTheDocument();

    // Close settings while still editing — header Save Layout remains available.
    fireEvent.click(view.getByRole('button', { name: 'Settings' }));
    expect(view.queryByRole('button', { name: 'Edit Layout' })).not.toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Save Layout' })).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Reset Layout' })).not.toBeInTheDocument();

    fireEvent.click(view.getByRole('button', { name: 'Save Layout' }));
    expect(
      view.queryByLabelText('Drag to reorder Top Receivers from Internet'),
    ).not.toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Save Layout' })).not.toBeInTheDocument();
  });

  it('Reset Layout restores factory defaults and stays in edit mode', async () => {
    localStorage.setItem(
      'wdmbg.dashboard.urlCards',
      JSON.stringify([{ id: 'url:custom', title: 'Custom', url: 'https://custom.example' }]),
    );
    localStorage.setItem(
      'wdmbg.dashboard.cardOrder',
      JSON.stringify(['topTalkers', 'url:custom', 'topReceivers', 'hotFlows']),
    );
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    localStorage.setItem('wdmbg.dashboard.wideCards', JSON.stringify(['topTalkers']));

    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Custom' })).toBeInTheDocument();
    });

    setEditLayout(view, true);
    expect(view.getByRole('button', { name: 'Reset Layout' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Reset Layout' }));

    // Still editing after reset.
    expect(view.getByRole('button', { name: 'Save Layout' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Reset Layout' })).toBeInTheDocument();
    expect(view.getByLabelText('Drag to reorder Top Receivers from Internet')).toBeInTheDocument();

    expect(view.getByRole('heading', { name: 'Speedify' })).toBeInTheDocument();
    expect(view.queryByRole('heading', { name: 'Custom' })).not.toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Top talkers' }).closest('section')).toHaveClass(
      'is-hidden-card',
    );
    expect(view.getByRole('heading', { name: 'Bulk flows' }).closest('section')).toHaveClass(
      'is-wide-card',
    );

    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.urlCards') ?? '[]')).toEqual([
      {
        id: 'url:speedify',
        title: 'Speedify',
        url: 'https://speedify.kronvold.org',
        heightRem: 19,
      },
    ]);
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.hiddenCards') ?? '[]')).toEqual([
      'topTalkers',
      'topReceivers',
      'topProtocols',
      'topCountries',
    ]);
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.wideCards') ?? '[]')).toEqual([
      'hotFlows',
    ]);
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.cardOrder') ?? '[]')).toEqual([
      'topLocalTalkers',
      'topLocalReceivers',
      'url:speedify',
      'trafficSummary',
      'hotFlows',
      'topTalkers',
      'topReceivers',
      'topProtocols',
      'topCountries',
    ]);

    // Reset control hides after Save Layout.
    setEditLayout(view, false);
    openSettings(view);
    expect(view.queryByRole('button', { name: 'Reset Layout' })).not.toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Edit Layout' })).toBeInTheDocument();
  });

  it('restores settings open preference on load', async () => {
    localStorage.setItem('wdmbg.dashboard.settingsOpen', '1');
    const { container } = renderApp();
    const view = within(container);
    const gear = view.getByRole('button', { name: 'Settings' });
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    expect(view.getByLabelText('Color theme')).toBeInTheDocument();
  });

  it('changes theme via select and persists preference', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('midnight');
    });

    openSettings(view);
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
    openSettings(view);
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
    openSettings(view);
    expect((view.getByRole('combobox', { name: 'Color theme' }) as HTMLSelectElement).value).toBe(
      'midnight',
    );
  });

  it('pauses dashboard refetching via Display Refresh and shows paused state', async () => {
    // Disable auto-resolve so name lookup invalidations do not look like refresh ticks.
    localStorage.setItem(RESOLVE_NAME_KEY, 'disabled');
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });

    const callsAfterMount = vi.mocked(client.fetchDashboard).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    openSettings(view);
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });

    openSettings(view);
    const toggle = view.getByRole('button', { name: 'Local Traffic Shown' });
    fireEvent.click(toggle);
    expect(view.getByRole('button', { name: 'Local Traffic Hidden' })).toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.localTraffic')).toBe('hidden');
    await waitFor(() => {
      expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[1] === true)).toBe(true);
    });
  });

  it('defaults Visualization to bars and renders relative row bars on dashboard cards', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    openSettings(view);
    const resolve = view.getByText('Resolve Name');
    const vizLabel = view.getByText('Visualization');
    const traffic = view.getByText('Traffic window');
    expect(
      resolve.compareDocumentPosition(vizLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      vizLabel.compareDocumentPosition(traffic) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const vizGroup = view.getByRole('group', { name: 'Visualization' });
    expect(within(vizGroup).getByRole('button', { name: 'bars' })).toHaveClass('primary');
    expect(within(vizGroup).getByRole('button', { name: 'lines' })).toBeInTheDocument();
    expect(within(vizGroup).getByRole('button', { name: 'off' })).toBeInTheDocument();
    expect(localStorage.getItem('wdmbg.visualization')).toBeNull();

    const talkers = view.getByRole('heading', { name: 'Top talkers' }).closest('section')!;
    const rows = talkers.querySelectorAll('tbody tr.viz-row.viz-bars');
    expect(rows.length).toBe(2);
    // Default sort TX Mbps: nas 7M (70%) then laptop 3M (30%) of 10M total.
    expect((rows[0] as HTMLElement).getAttribute('style')).toMatch(/--viz-pct:\s*70%/);
    expect((rows[1] as HTMLElement).getAttribute('style')).toMatch(/--viz-pct:\s*30%/);

    const flows = view.getByRole('heading', { name: 'Bulk flows' }).closest('section')!;
    expect(flows.querySelectorAll('tbody tr.viz-row.viz-bars').length).toBe(1);
    expect((flows.querySelector('tbody tr.viz-row') as HTMLElement).getAttribute('style')).toMatch(
      /--viz-pct:\s*100%/,
    );

    const protocols = view.getByRole('heading', { name: 'Top protocols' }).closest('section')!;
    const protoRows = protocols.querySelectorAll('tbody tr.viz-row.viz-bars');
    expect(protoRows.length).toBe(2);
    // https 4M (80%) + dns 1M (20%)
    expect((protoRows[0] as HTMLElement).getAttribute('style')).toMatch(/--viz-pct:\s*80%/);
    expect((protoRows[1] as HTMLElement).getAttribute('style')).toMatch(/--viz-pct:\s*20%/);
  });

  it('persists Visualization selection and switches bars to lines', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    const { container, unmount } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    openSettings(view);
    const group = view.getByRole('group', { name: 'Visualization' });
    fireEvent.click(within(group).getByRole('button', { name: 'lines' }));
    expect(localStorage.getItem('wdmbg.visualization')).toBe('lines');

    const talkers = view.getByRole('heading', { name: 'Top talkers' }).closest('section')!;
    expect(talkers.querySelectorAll('tbody tr.viz-row.viz-lines').length).toBe(2);
    expect(talkers.querySelector('tbody tr.viz-bars')).toBeNull();

    unmount();
    const remounted = renderApp();
    const remountedView = within(remounted.container);
    await waitFor(() => {
      expect(remountedView.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    openSettings(remountedView);
    expect(
      within(remountedView.getByRole('group', { name: 'Visualization' })).getByRole('button', {
        name: 'lines',
      }),
    ).toHaveClass('primary');
    const remountedTalkers = remountedView
      .getByRole('heading', { name: 'Top talkers' })
      .closest('section')!;
    expect(remountedTalkers.querySelectorAll('tbody tr.viz-row.viz-lines').length).toBe(2);
  });

  it('switches Visualization to off and persists with no row viz classes', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    const { container, unmount } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });

    openSettings(view);
    const group = view.getByRole('group', { name: 'Visualization' });
    fireEvent.click(within(group).getByRole('button', { name: 'off' }));
    expect(localStorage.getItem('wdmbg.visualization')).toBe('off');
    expect(within(group).getByRole('button', { name: 'off' })).toHaveClass('primary');

    const talkers = view.getByRole('heading', { name: 'Top talkers' }).closest('section')!;
    expect(talkers.querySelector('tbody tr.viz-row')).toBeNull();
    expect(talkers.querySelector('tbody tr.viz-bars')).toBeNull();
    expect(talkers.querySelector('tbody tr.viz-lines')).toBeNull();

    const flows = view.getByRole('heading', { name: 'Bulk flows' }).closest('section')!;
    expect(flows.querySelector('tbody tr.viz-row')).toBeNull();

    unmount();
    const remounted = renderApp();
    const remountedView = within(remounted.container);
    await waitFor(() => {
      expect(remountedView.getByRole('heading', { name: 'Top talkers' })).toBeInTheDocument();
    });
    openSettings(remountedView);
    expect(
      within(remountedView.getByRole('group', { name: 'Visualization' })).getByRole('button', {
        name: 'off',
      }),
    ).toHaveClass('primary');
    const remountedTalkers = remountedView
      .getByRole('heading', { name: 'Top talkers' })
      .closest('section')!;
    expect(remountedTalkers.querySelector('tbody tr.viz-row')).toBeNull();
  });

  it('defaults Visualization to bars when stored value is invalid', async () => {
    localStorage.setItem('wdmbg.visualization', 'sparkles');
    const { container } = renderApp();
    const view = within(container);
    openSettings(view);
    expect(
      within(view.getByRole('group', { name: 'Visualization' })).getByRole('button', {
        name: 'bars',
      }),
    ).toHaveClass('primary');
  });

  it('persists Traffic window selection across remount', async () => {
    const { container, unmount } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });

    openSettings(view);
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
      expect(remountedView.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[0] === '5m')).toBe(true);
    // Opening settings also restores the panel because toggle persisted open='1'.
    openSettings(remountedView);
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    expect(vi.mocked(client.fetchDashboard).mock.calls.some((c) => c[0] === '30s')).toBe(true);
    openSettings(view);
    expect(
      within(view.getByRole('group', { name: 'Traffic window' })).getByRole('button', {
        name: '30s',
      }),
    ).toHaveClass('primary');
  });

  it('defaults Resolve Name to Auto and auto-resolves without writing pref', async () => {
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });

    openSettings(view);
    expect(view.getByRole('button', { name: 'Resolve Name Auto' })).toBeInTheDocument();
    expect(localStorage.getItem(RESOLVE_NAME_KEY)).toBeNull();

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

  it('persists Resolve Name Disabled when toggled off', async () => {
    const { container } = renderApp();
    const view = within(container);
    openSettings(view);
    await waitFor(() => {
      expect(view.getByRole('button', { name: 'Resolve Name Auto' })).toBeInTheDocument();
    });

    fireEvent.click(view.getByRole('button', { name: 'Resolve Name Auto' }));
    expect(view.getByRole('button', { name: 'Resolve Name Disabled' })).toBeInTheDocument();
    expect(localStorage.getItem(RESOLVE_NAME_KEY)).toBe('disabled');
  });

  it('restores Resolve Name Disabled preference on load and does not auto-resolve', async () => {
    localStorage.setItem(RESOLVE_NAME_KEY, 'disabled');
    const { container } = renderApp();
    const view = within(container);
    openSettings(view);
    await waitFor(() => {
      expect(view.getByRole('button', { name: 'Resolve Name Disabled' })).toBeInTheDocument();
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(vi.mocked(client.resolveHosts)).not.toHaveBeenCalled();
  });

  it('shows Top traffic by country only when geoip present', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
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
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    vi.mocked(client.fetchHealth).mockResolvedValue({
      status: 'ok',
      service: 'wdmbg-api',
      version: '0.0.0',
      geoip: { configured: true, present: true },
    });
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
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
      expect(view.getByRole('heading', { name: 'Bulk flows' })).toBeInTheDocument();
    });

    const flowsPanel = () => view.getByRole('heading', { name: 'Bulk flows' }).closest('section')!;
    // Factory default: Bulk flows is wide without writing localStorage yet.
    expect(flowsPanel()).toHaveClass('is-wide-card');
    expect(localStorage.getItem('wdmbg.dashboard.wideCards')).toBeNull();
    expect(
      view.queryByRole('button', { name: /Make Bulk flows normal width/i }),
    ).not.toBeInTheDocument();

    setEditLayout(view, true);
    const wideBtn = view.getByRole('button', { name: 'Make Bulk flows normal width' });
    expect(wideBtn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(wideBtn);

    // Panel remounts under non-wide `.grid` when width toggles — re-query the section.
    expect(flowsPanel()).not.toHaveClass('is-wide-card');
    expect(view.getByRole('button', { name: 'Make Bulk flows full width' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.wideCards') ?? 'null')).toEqual([]);

    setEditLayout(view, false);
    expect(flowsPanel()).not.toHaveClass('is-wide-card');
    expect(view.queryByRole('button', { name: /Make Bulk flows/i })).not.toBeInTheDocument();
  });

  it('restores wide cards from localStorage on load', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    localStorage.setItem('wdmbg.dashboard.wideCards', JSON.stringify(['topTalkers']));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    expect(view.getByRole('heading', { name: 'Top talkers' }).closest('section')).toHaveClass(
      'is-wide-card',
    );
  });

  it('renders wide cards outside non-wide grids and keeps non-wide siblings together', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
    localStorage.setItem('wdmbg.dashboard.wideCards', JSON.stringify(['hotFlows']));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Bulk flows' })).toBeInTheDocument();
    });

    const boards = container.querySelector('.dashboard-boards');
    expect(boards).toBeTruthy();
    expect(boards?.parentElement).toBeTruthy();

    const flows = view.getByRole('heading', { name: 'Bulk flows' }).closest('section')!;
    expect(flows).toHaveClass('is-wide-card');
    expect(flows.closest('.grid-wide')).toBeTruthy();
    expect(flows.closest('.grid')).toBeNull();
    expect(boards?.contains(flows.closest('.grid-wide'))).toBe(true);

    const talkers = view.getByRole('heading', { name: 'Top talkers' }).closest('section')!;
    const receivers = view.getByRole('heading', { name: 'Top receivers' }).closest('section')!;
    const nonWideGrid = talkers.closest('.grid');
    expect(nonWideGrid).toBeTruthy();
    expect(nonWideGrid).toBe(receivers.closest('.grid'));
    expect(nonWideGrid).not.toBe(flows.closest('.grid-wide'));
    expect(boards?.contains(nonWideGrid)).toBe(true);
    // Segments are direct children: .grid / .grid-wide under .dashboard-boards
    expect(nonWideGrid?.parentElement).toBe(boards);
    expect(flows.closest('.grid-wide')?.parentElement).toBe(boards);
  });

  it('persists table sort order and restores it on reload', async () => {
    localStorage.setItem('wdmbg.dashboard.hiddenCards', JSON.stringify([]));
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
    // Sort state is shown on the column header arrow only — not in the panel legend.
    expect(within(protocols).getByText(/last 30s/).textContent).not.toMatch(/sorted by/i);
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
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
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

  it('adds, persists, hides, wides, and deletes URL cards', async () => {
    localStorage.setItem('wdmbg.dashboard.urlCards', JSON.stringify([]));
    const { container, unmount } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });

    expect(view.queryByRole('button', { name: 'Add URL card' })).not.toBeInTheDocument();
    setEditLayout(view, true);
    fireEvent.click(view.getByRole('button', { name: 'Add URL card' }));

    const addForm = view.getByRole('form', { name: 'Add URL card' });
    fireEvent.change(within(addForm).getByLabelText('Title'), { target: { value: 'Grafana' } });
    fireEvent.change(within(addForm).getByLabelText('URL'), {
      target: { value: 'https://grafana.example.com/d/x' },
    });
    fireEvent.change(within(addForm).getByLabelText(/Height/), { target: { value: '30' } });
    fireEvent.click(within(addForm).getByRole('button', { name: 'Add card' }));

    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Grafana' })).toBeInTheDocument();
    });

    const panel = view.getByRole('heading', { name: 'Grafana' }).closest('section')!;
    const iframe = panel.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe).toHaveAttribute('src', 'https://grafana.example.com/d/x');
    expect(iframe).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
    );
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(iframe).toHaveAttribute('loading', 'lazy');
    expect(panel.querySelector('.url-card-frame-wrap')).toHaveStyle({ height: '30rem' });

    const stored = JSON.parse(localStorage.getItem('wdmbg.dashboard.urlCards') ?? '[]') as Array<{
      id: string;
      title: string;
      url: string;
      heightRem?: number;
    }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: 'Grafana',
      url: 'https://grafana.example.com/d/x',
      heightRem: 30,
    });
    expect(stored[0]!.id.startsWith('url:')).toBe(true);
    const urlId = stored[0]!.id;

    const order = JSON.parse(localStorage.getItem('wdmbg.dashboard.cardOrder') ?? '[]') as string[];
    expect(order).toContain(urlId);

    fireEvent.click(view.getByRole('button', { name: 'Hide Grafana' }));
    expect(panel).toHaveClass('is-hidden-card');
    setEditLayout(view, false);
    expect(view.queryByRole('heading', { name: 'Grafana' })).not.toBeInTheDocument();

    setEditLayout(view, true);
    expect(view.getByRole('heading', { name: 'Grafana' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Show Grafana' }));
    fireEvent.click(view.getByRole('button', { name: 'Make Grafana full width' }));
    expect(view.getByRole('heading', { name: 'Grafana' }).closest('section')).toHaveClass(
      'is-wide-card',
    );
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.wideCards') ?? '[]')).toContain(urlId);

    setEditLayout(view, false);
    const viewPanel = view.getByRole('heading', { name: 'Grafana' }).closest('section')!;
    const refreshBtn = within(viewPanel).getByRole('button', { name: 'Refresh Grafana' });
    const iframeBefore = viewPanel.querySelector('iframe');
    expect(iframeBefore).toBeTruthy();
    fireEvent.click(refreshBtn);
    const iframeAfter = viewPanel.querySelector('iframe');
    expect(iframeAfter).toBeTruthy();
    expect(iframeAfter).toHaveAttribute('src', 'https://grafana.example.com/d/x');
    const popout = within(viewPanel).getByRole('link', { name: 'Pop out Grafana' });
    expect(popout).toHaveAttribute('href', 'https://grafana.example.com/d/x');
    expect(popout).toHaveAttribute('target', '_blank');
    expect(popout).toHaveAttribute('rel', expect.stringContaining('noopener'));

    setEditLayout(view, true);
    fireEvent.click(view.getByRole('button', { name: 'Edit Grafana' }));
    const editForm = view.getByRole('form', { name: 'Edit Grafana card' });
    fireEvent.change(within(editForm).getByLabelText('Refresh'), { target: { value: '60' } });
    fireEvent.change(within(editForm).getByLabelText('Scale'), { target: { value: '0.5' } });
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save' }));
    const storedRefresh = JSON.parse(
      localStorage.getItem('wdmbg.dashboard.urlCards') ?? '[]',
    ) as Array<{ refreshSec?: number; scale?: number }>;
    expect(storedRefresh[0]?.refreshSec).toBe(60);
    expect(storedRefresh[0]?.scale).toBe(0.5);
    setEditLayout(view, false);
    const scaledPanel = view.getByRole('heading', { name: 'Grafana' }).closest('section')!;
    const scaledWrap = scaledPanel.querySelector('.url-card-frame-wrap');
    const scaledFrame = scaledPanel.querySelector('iframe');
    expect(scaledWrap).toHaveAttribute('data-scale', '0.5');
    expect(scaledFrame).toHaveClass('is-scaled');
    // Pop-out stays full URL at 100% (scale is card chrome only).
    expect(within(scaledPanel).getByRole('link', { name: 'Pop out Grafana' })).toHaveAttribute(
      'href',
      'https://grafana.example.com/d/x',
    );

    unmount();
    const again = renderApp();
    const view2 = within(again.container);
    await waitFor(() => {
      expect(view2.getByRole('heading', { name: 'Grafana' })).toBeInTheDocument();
    });
    expect(view2.getByRole('heading', { name: 'Grafana' }).closest('section')).toHaveClass(
      'is-wide-card',
    );

    setEditLayout(view2, true);
    fireEvent.click(view2.getByRole('button', { name: 'Delete Grafana' }));
    fireEvent.click(view2.getByRole('button', { name: 'Confirm delete Grafana' }));
    expect(view2.queryByRole('heading', { name: 'Grafana' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.urlCards') ?? '[]')).toEqual([]);
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.cardOrder') ?? '[]')).not.toContain(
      urlId,
    );
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.wideCards') ?? '[]')).not.toContain(
      urlId,
    );
  });

  it('rejects invalid URL card URLs in the add form', async () => {
    localStorage.setItem('wdmbg.dashboard.urlCards', JSON.stringify([]));
    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Traffic summary' })).toBeInTheDocument();
    });
    setEditLayout(view, true);
    fireEvent.click(view.getByRole('button', { name: 'Add URL card' }));
    const addForm = view.getByRole('form', { name: 'Add URL card' });
    fireEvent.change(within(addForm).getByLabelText('Title'), { target: { value: 'Bad' } });
    fireEvent.change(within(addForm).getByLabelText('URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(within(addForm).getByRole('button', { name: 'Add card' }));
    expect(view.getByRole('alert')).toHaveTextContent(/https/i);
    expect(JSON.parse(localStorage.getItem('wdmbg.dashboard.urlCards') ?? '[]')).toEqual([]);
  });

  it('moves built-in and URL cards with up/down controls and disables edges', async () => {
    localStorage.setItem(
      'wdmbg.dashboard.urlCards',
      JSON.stringify([{ id: 'url:dash', title: 'Dash', url: 'https://dash.example.com' }]),
    );
    localStorage.setItem(
      'wdmbg.dashboard.cardOrder',
      JSON.stringify(['trafficSummary', 'topTalkers', 'url:dash', 'topReceivers']),
    );

    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Dash' })).toBeInTheDocument();
    });

    const readOrder = () =>
      JSON.parse(localStorage.getItem('wdmbg.dashboard.cardOrder') ?? '[]') as string[];

    expect(view.queryByRole('button', { name: 'Move Top talkers up' })).not.toBeInTheDocument();
    setEditLayout(view, true);

    const firstUp = view.getByRole('button', { name: 'Move Traffic summary up' });
    const firstDown = view.getByRole('button', { name: 'Move Traffic summary down' });
    expect(firstUp).toBeDisabled();
    expect(firstDown).not.toBeDisabled();

    const urlFrame = view
      .getByRole('heading', { name: 'Dash' })
      .closest('section')!
      .querySelector('iframe');
    expect(urlFrame).toHaveClass('is-edit-mode');

    fireEvent.click(view.getByRole('button', { name: 'Move Dash up' }));
    let order = readOrder();
    expect(order.indexOf('url:dash')).toBe(order.indexOf('topTalkers') - 1);

    fireEvent.click(view.getByRole('button', { name: 'Move Dash up' }));
    order = readOrder();
    expect(order[0]).toBe('url:dash');
    expect(view.getByRole('button', { name: 'Move Dash up' })).toBeDisabled();

    fireEvent.click(view.getByRole('button', { name: 'Move Dash down' }));
    order = readOrder();
    expect(order.indexOf('url:dash')).toBe(order.indexOf('trafficSummary') + 1);

    setEditLayout(view, false);
    expect(view.queryByRole('button', { name: 'Move Dash up' })).not.toBeInTheDocument();
    const viewFrame = view
      .getByRole('heading', { name: 'Dash' })
      .closest('section')!
      .querySelector('iframe');
    expect(viewFrame).not.toHaveClass('is-edit-mode');
  });

  it('drops orphan url card refs and invalid defs on load', async () => {
    localStorage.setItem(
      'wdmbg.dashboard.urlCards',
      JSON.stringify([
        {
          id: 'url:keep-me',
          title: 'Keep',
          url: 'https://keep.example.com',
        },
        {
          id: 'url:bad-js',
          title: 'Nope',
          url: 'javascript:alert(1)',
        },
      ]),
    );
    localStorage.setItem(
      'wdmbg.dashboard.cardOrder',
      JSON.stringify(['topTalkers', 'url:keep-me', 'url:missing', 'hotFlows']),
    );
    localStorage.setItem(
      'wdmbg.dashboard.hiddenCards',
      JSON.stringify(['url:missing', 'topProtocols']),
    );
    localStorage.setItem('wdmbg.dashboard.wideCards', JSON.stringify(['url:keep-me', 'url:gone']));

    const { container } = renderApp();
    const view = within(container);
    await waitFor(() => {
      expect(view.getByRole('heading', { name: 'Keep' })).toBeInTheDocument();
    });
    expect(view.queryByRole('heading', { name: 'Nope' })).not.toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Keep' }).closest('section')).toHaveClass(
      'is-wide-card',
    );

    const order = JSON.parse(localStorage.getItem('wdmbg.dashboard.cardOrder') ?? '[]') as string[];
    // order is only rewritten on change; loaders filter in memory
    expect(order).toContain('url:keep-me');
    expect(view.queryByRole('heading', { name: 'missing' })).not.toBeInTheDocument();
  });
});
