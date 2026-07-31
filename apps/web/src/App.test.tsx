import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('App', () => {
  it('renders the WDMBG shell and window controls', () => {
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
  });
});
