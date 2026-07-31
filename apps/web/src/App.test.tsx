import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the WDMBG shell', () => {
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
  });
});
