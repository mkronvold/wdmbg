import type { QueryWindow } from '@wdmbg/contracts';

export const WINDOWS: QueryWindow[] = ['5s', '30s', '5m', '15m', '30m', '1h'];

export const VISUALIZATION_OPTIONS = ['bars', 'lines', 'off'] as const;
export type VisualizationMode = (typeof VISUALIZATION_OPTIONS)[number];

export const DISPLAY_REFRESH_OPTIONS = [
  { id: 'pause', label: 'Pause', ms: null as number | null },
  { id: '1s', label: '1s', ms: 1_000 },
  { id: '5s', label: '5s', ms: 5_000 },
  { id: '30s', label: '30s', ms: 30_000 },
  { id: '1m', label: '1m', ms: 60_000 },
  { id: '5m', label: '5m', ms: 300_000 },
  { id: '15m', label: '15m', ms: 900_000 },
] as const;

export type DisplayRefreshId = (typeof DISPLAY_REFRESH_OPTIONS)[number]['id'];

export function displayRefreshInterval(id: DisplayRefreshId): number | false {
  const opt = DISPLAY_REFRESH_OPTIONS.find((o) => o.id === id) ?? DISPLAY_REFRESH_OPTIONS[2];
  return opt.ms === null ? false : opt.ms;
}
