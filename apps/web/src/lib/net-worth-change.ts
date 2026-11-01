/**
 * Month-over-month change column for the net-worth History list (#406).
 *
 * Computed purely client-side from the loaded snapshots. Rows are compared
 * with the chronologically previous snapshot (arbitrary dates now — the day
 * the user pressed "Yes" plus manual backfills), not a fixed calendar offset.
 * Caveat: conversion uses the current rates for both rows (historical rates
 * are not stored), so part of a multi-currency difference can be FX movement.
 */
export interface SnapshotChange {
  /** Signed difference (current - previous). */
  diff: number;
  /** Signed percentage vs the previous value; null when previous is 0. */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * @param rowsNewestFirst snapshot rows ordered newest first
 * @param values comparable total per row id; null/undefined = cannot be computed
 * @returns row id -> change, or null (placeholder) for the oldest row or when
 *          either side's value is unavailable
 */
export function computeSnapshotChanges(
  rowsNewestFirst: { id: string }[],
  values: Map<string, number | null>,
): Map<string, SnapshotChange | null> {
  const out = new Map<string, SnapshotChange | null>();
  rowsNewestFirst.forEach((row, i) => {
    const prev = rowsNewestFirst[i + 1];
    const cur = values.get(row.id);
    const before = prev ? values.get(prev.id) : null;
    if (!prev || cur == null || before == null) {
      out.set(row.id, null);
      return;
    }
    const diff = cur - before;
    // Treat sub-cent noise as "no change" so float dust never shows +0.00.
    const flat = Math.abs(diff) < 0.005;
    out.set(row.id, {
      diff: flat ? 0 : diff,
      pct:
        before === 0 || flat
          ? flat
            ? 0
            : null
          : (diff / Math.abs(before)) * 100,
      direction: flat ? 'flat' : diff > 0 ? 'up' : 'down',
    });
  });
  return out;
}
