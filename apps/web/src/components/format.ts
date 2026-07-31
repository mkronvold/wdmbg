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
