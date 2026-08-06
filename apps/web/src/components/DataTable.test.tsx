import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';

afterEach(() => {
  cleanup();
});

type Row = { name: string; bytes: number; label: string };

const rows: Row[] = [
  { name: 'a', bytes: 30, label: 'alpha' },
  { name: 'b', bytes: 70, label: 'beta' },
];

const columns = [
  {
    key: 'n',
    header: 'Name',
    width: 'primary' as const,
    render: (r: Row) => r.label,
    sortValue: (r: Row) => r.label,
  },
  {
    key: 'b',
    header: 'Bytes',
    numeric: true,
    render: (r: Row) => r.bytes,
    sortValue: (r: Row) => r.bytes,
  },
];

describe('DataTable visualization', () => {
  it('sets --viz-pct from share of numeric sort-column total', () => {
    const { container } = render(
      <DataTable title="Demo" rows={rows} columns={columns} defaultSortKey="b" visualization="bars" />,
    );
    const table = container.querySelector('table')!;
    const bodyRows = table.querySelectorAll('tbody tr.viz-row.viz-bars');
    expect(bodyRows.length).toBe(2);
    // desc by bytes: beta 70%, alpha 30%
    expect((bodyRows[0] as HTMLElement).style.getPropertyValue('--viz-pct')).toBe('70%');
    expect((bodyRows[1] as HTMLElement).style.getPropertyValue('--viz-pct')).toBe('30%');
    expect(within(bodyRows[0] as HTMLElement).getByText('beta')).toBeInTheDocument();
  });

  it('uses lines class when visualization is lines', () => {
    const { container } = render(
      <DataTable
        title="Demo"
        rows={rows}
        columns={columns}
        defaultSortKey="b"
        visualization="lines"
      />,
    );
    expect(container.querySelectorAll('tbody tr.viz-row.viz-lines').length).toBe(2);
    expect(container.querySelector('tbody tr.viz-bars')).toBeNull();
  });

  it('omits visualization when sorted by a non-numeric column', () => {
    const { container } = render(
      <DataTable title="Demo" rows={rows} columns={columns} defaultSortKey="b" visualization="bars" />,
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Sort by Name' }));
    expect(container.querySelector('tbody tr.viz-row')).toBeNull();
  });

  it('omits visualization when prop is not set', () => {
    const { container } = render(
      <DataTable title="Demo" rows={rows} columns={columns} defaultSortKey="b" />,
    );
    expect(container.querySelector('tbody tr.viz-row')).toBeNull();
  });
});
