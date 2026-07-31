import { describe, expect, it } from 'vitest';
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
