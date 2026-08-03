/**
 * Live slip-into-place reorder: remove source, insert before target.
 * Returns the same array reference when nothing changes.
 */
export function reorderCards<T extends string>(order: readonly T[], sourceId: T, targetId: T): T[] {
  if (sourceId === targetId) return order as T[];
  const from = order.indexOf(sourceId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return order as T[];
  const next = order.slice() as T[];
  next.splice(from, 1);
  const insertAt = next.indexOf(targetId);
  if (insertAt < 0) return order as T[];
  next.splice(insertAt, 0, sourceId);
  for (let i = 0; i < order.length; i++) {
    if (order[i] !== next[i]) return next;
  }
  return order as T[];
}

/** Board segment: consecutive non-wide cards share one `.grid`. */
export type CardSegment<T extends string> = { type: 'grid'; ids: T[] } | { type: 'wide'; id: T };

/**
 * Split visible card ids into non-wide grid runs and full-width wide singles.
 * Wide cards must sit outside the non-wide `.grid` — `column-span: all` (and
 * multicol packing in general) breaks side-by-side layout in Chromium.
 */
export function segmentVisibleCards<T extends string>(
  ids: readonly T[],
  wideSet: ReadonlySet<T>,
): CardSegment<T>[] {
  const segments: CardSegment<T>[] = [];
  let gridIds: T[] = [];

  const flushGrid = () => {
    if (gridIds.length === 0) return;
    segments.push({ type: 'grid', ids: gridIds });
    gridIds = [];
  };

  for (const id of ids) {
    if (wideSet.has(id)) {
      flushGrid();
      segments.push({ type: 'wide', id });
    } else {
      gridIds.push(id);
    }
  }
  flushGrid();
  return segments;
}
