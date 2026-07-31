import { describe, expect, it } from 'vitest';
import { formatBytes, formatMb, formatMbps, rateMbps, windowLegend } from './format';

describe('formatMb', () => {
  it('uses decimal megabytes without a unit suffix', () => {
    expect(formatMb(0)).toBe('0');
    expect(formatMb(1_000_000)).toBe('1.00');
    expect(formatMb(12_400_000)).toBe('12.4');
    expect(formatMb(500)).toBe('0.001');
  });

  it('guards non-finite input', () => {
    expect(formatMb(Number.NaN)).toBe('0');
    expect(formatMb(-1)).toBe('0');
  });
});

describe('formatMbps / rateMbps', () => {
  it('computes (bytes * 8) / seconds / 1e6', () => {
    // 30_000_000 bytes over 30s → 8 Mbps
    expect(rateMbps(30_000_000, 30)).toBeCloseTo(8, 6);
    expect(formatMbps(30_000_000, 30)).toBe('8.00');
  });

  it('returns 0 for invalid window', () => {
    expect(rateMbps(1000, 0)).toBe(0);
    expect(formatMbps(1000, 0)).toBe('0');
  });
});

describe('formatBytes', () => {
  it('keeps binary-style scaling for the live ticker', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
  });
});

describe('windowLegend', () => {
  it('uses last-window wording and units', () => {
    expect(windowLegend('30s')).toBe('last 30s · Totals in MB · Rates in Mbps');
  });
});
