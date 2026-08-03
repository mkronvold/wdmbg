import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';
import { rowsToCsv, rowsToRich } from './tableCopy';

describe('copy helpers', () => {
  it('builds csv and rich text', () => {
    const headers = ['Host', 'Bytes'];
    const rows = [
      ['10.0.0.1', '100'],
      ['a,b', '2'],
    ];
    expect(rowsToRich(headers, rows)).toContain('10.0.0.1\t100');
    expect(rowsToCsv(headers, rows)).toContain('"a,b",2');
  });
});

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows glyph only and prompts on clipboard failure', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });
    render(<CopyButton richText="a\tb" csvText="a,b" />);
    const btn = screen.getByRole('button', { name: 'Copy' });
    expect(btn).toHaveTextContent('⧉');
    expect(btn).not.toHaveTextContent('Copy');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Clipboard blocked/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Chrome/i);
  });
});
