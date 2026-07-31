/** Decimal megabytes (bytes / 1e6). Bare number for table cells. */
export function formatMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0';
  const mb = bytes / 1e6;
  if (mb === 0) return '0';
  if (mb < 0.01) return mb.toFixed(3);
  if (mb < 10) return mb.toFixed(2);
  if (mb < 100) return mb.toFixed(1);
  return mb.toFixed(0);
}

/** Megabits/sec from window byte total: (bytes * 8) / seconds / 1e6. */
export function rateMbps(bytes: number, windowSeconds: number): number {
  if (
    !Number.isFinite(bytes) ||
    bytes < 0 ||
    !Number.isFinite(windowSeconds) ||
    windowSeconds <= 0
  ) {
    return 0;
  }
  return (bytes * 8) / windowSeconds / 1e6;
}

/** Bare Mbps number for table cells (unit lives in header/legend). */
export function formatMbps(bytes: number, windowSeconds: number): string {
  const mbps = rateMbps(bytes, windowSeconds);
  if (mbps === 0) return '0';
  if (mbps < 0.01) return mbps.toFixed(3);
  if (mbps < 10) return mbps.toFixed(2);
  if (mbps < 100) return mbps.toFixed(1);
  return mbps.toFixed(0);
}

/** Human-readable bytes with binary units (KiB/MiB style via 1024). Used for live ticker. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export function formatBps(bitsPerSec: number): string {
  return `${formatBytes(bitsPerSec / 8)}/s`;
}

export function hostLabel(host: string, label?: string): string {
  return label ? `${label} (${host})` : host;
}

export function windowLegend(windowLabel: string): string {
  return `last ${windowLabel} · Totals in MB · Rates in Mbps`;
}
