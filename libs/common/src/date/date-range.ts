/**
 * Half-open interval helpers for date range queries (#82).
 *
 * SQL `column <= :to` silently drops rows at 23:59:59 on the boundary date
 * if the column becomes a TIMESTAMP (the comparison becomes
 * `column <= '2026-07-31 00:00:00'`). The safer form is a half-open
 * interval `column >= :from AND column < :toExclusive` — correct regardless
 * of whether the column is DATE or TIMESTAMP.
 *
 * Callers pass the inclusive `to` from the user (YYYY-MM-DD) and receive
 * the next-day boundary to plug into the query.
 */

/**
 * Returns the ISO date string (YYYY-MM-DD) one day after `to`.
 *
 * Examples:
 *   nextDayIso('2026-07-31') === '2026-08-01'
 *   nextDayIso('2026-02-28') === '2026-03-01'
 *   nextDayIso('2027-12-31') === '2028-01-01'
 */
export function nextDayIso(to: string): string {
  const d = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`nextDayIso: invalid date "${to}"`);
  }
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
