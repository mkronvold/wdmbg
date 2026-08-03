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
