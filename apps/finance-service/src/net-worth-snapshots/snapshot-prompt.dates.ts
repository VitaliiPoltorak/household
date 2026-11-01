/**
 * Pure UTC date helpers for the month-end snapshot prompt (#406). All dates
 * are `YYYY-MM-DD` / `YYYY-MM` strings so the module never touches the host
 * timezone — "today" is the UTC calendar date, matching the other schedulers.
 */

/** Days before month end (inclusive of the last day) the prompt opens. */
export const PROMPT_WINDOW_DAYS = 5;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateString(d);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  // Day 0 of the following month is the last day of this one.
  const d = new Date(Date.UTC(y, m, 0));
  return utcDateString(d);
}

/** First day the prompt for `month` is shown: the last 5 calendar days of the
 *  month, inclusive (26 Nov for a 30-day month, 24 Feb in a non-leap year). */
export function promptOpensOn(month: string): string {
  return addDays(lastDayOfMonth(month), -(PROMPT_WINDOW_DAYS - 1));
}

/** The newest month whose prompt window has opened on `today`. The prompt for
 *  month M lives from promptOpensOn(M) until promptOpensOn(M+1) exclusive, so
 *  an unanswered prompt is replaced — not carried over — by the next one. */
export function dueMonth(today: string): string {
  const current = monthOf(today);
  return today >= promptOpensOn(current) ? current : addMonths(current, -1);
}
