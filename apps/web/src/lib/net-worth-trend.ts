import type { NetWorthSnapshot, Transaction } from '../types/api';
import { convert, type RateMap } from './currency';

export interface TrendTransactionSummary {
  id: string;
  description: string | null;
  type: Transaction['type'];
  /** Signed effect on this series' total (see {@link signedDelta}) — in the
   *  series' own currency for {@link buildTrendSeries}, or already converted
   *  to the target currency for {@link buildTotalTrendSeries}. */
  amount: number;
}

export interface TrendPoint {
  date: string;
  value: number;
  /** 'snapshot' = a persisted (or live "today") checkpoint; 'activity' =
   *  interpolated purely from that day's transactions. */
  kind: 'snapshot' | 'activity';
  source?: NetWorthSnapshot['source'] | 'live';
  /** Net change from that day's transactions — only set for kind:
   *  'activity', where it's how this point's value was derived from the
   *  previous one. A 'snapshot' point's value is authoritative regardless
   *  of same-day transactions, so those are never attached here (avoids
   *  reading as "still needs to be added/subtracted from this total"). */
  delta?: number;
  transactions?: TrendTransactionSummary[];
}

/**
 * Signed effect of one transaction row on `currency`'s total; 0 if the row
 * doesn't touch that currency. Mirrors Transaction.computeDelta
 * server-side. The transfer case additionally accounts for the collapsed
 * counter-leg: GET /transactions without an account filter always surfaces
 * the DEBIT leg as primary (see transactions.service.ts
 * collapseTransferPairs/pickPrimaryLeg), so `tx.currency`/`tx.amount` is the
 * outgoing side and `tx.counterCurrency`/`tx.counterAmount` the incoming
 * side — for a same-currency transfer the two cancel out to 0, which is
 * correct (money just moved between two accounts in the same household).
 */
function signedDelta(tx: Transaction, currency: string): number {
  switch (tx.type) {
    case 'income':
    case 'adjustment':
      return tx.currency === currency ? tx.amount : 0;
    case 'expense':
      return tx.currency === currency ? -tx.amount : 0;
    case 'transfer': {
      let delta = 0;
      if (tx.currency === currency) delta -= tx.amount;
      if (tx.counterCurrency === currency && tx.counterAmount !== null) {
        delta += tx.counterAmount;
      }
      return delta;
    }
    default:
      return 0;
  }
}

// Given the set of dates with activity (plus `todayDate`, already included),
// anchors the walk at `todayValue` and fills every other date by subtracting
// (walking backward) or adding (walking forward, for a future-dated outlier)
// that day's net delta relative to its neighbor. Shared by buildTrendSeries
// and buildTotalTrendSeries so the backward/forward-walk arithmetic — easy to
// get subtly backward — lives in exactly one place.
function walkFromAnchor(
  dates: string[],
  todayDate: string,
  todayValue: number,
  dayDelta: (date: string) => number,
): number[] {
  const todayIdx = dates.indexOf(todayDate);
  const values = new Array<number>(dates.length);
  values[todayIdx] = todayValue;
  for (let i = todayIdx - 1; i >= 0; i--) {
    values[i] = values[i + 1] - dayDelta(dates[i + 1]);
  }
  // Dates after today shouldn't occur (callers bound their data fetch at
  // today), but a forward pass keeps this correct if one sneaks in (e.g. a
  // clock skew or a future-dated entry).
  for (let i = todayIdx + 1; i < dates.length; i++) {
    values[i] = values[i - 1] + dayDelta(dates[i]);
  }
  return values;
}

/**
 * Builds one currency's trend series: the persisted snapshot points, plus —
 * only when a live "today" total is available — one point per day with
 * transaction activity in that currency (same-day transactions merged into
 * a single point).
 *
 * The transaction-derived ("activity") line is anchored SOLELY at `today`
 * and walked backward day by day, subtracting each day's net delta. It
 * deliberately never chains through a persisted snapshot as an intermediate
 * anchor. Snapshots (manual or auto) are a separate, independent
 * measurement — often a hand-entered historical estimate that predates real
 * account usage entirely — and forward-filling transaction deltas on top of
 * one silently conflates the two the moment real tracking begins.
 *
 * Production bug this fixes: a household hand-backfilled monthly totals,
 * then started using real accounts, initializing each one via a lump-sum
 * "adjust balance" correction. Those corrections summed to the household's
 * real current total, but the old algorithm added that sum ON TOP OF the
 * previous hand-entered figure (an unrelated number), roughly doubling the
 * displayed value for that day. Anchoring only at `today` and walking
 * backward means the activity line is always internally consistent with
 * itself — it never inherits a number from an unrelated manual entry.
 *
 * Snapshots are still shown as their own points, using their own stored
 * value, and take priority over the activity line on their exact date (a
 * manual/auto snapshot is authoritative for the day it names) — but that
 * override never propagates to any other date, unlike the old chaining
 * behavior. Without a live `today` (e.g. the net-worth query hasn't loaded,
 * or this currency has no live balance), only the snapshot points are
 * returned — there's no trustworthy anchor to derive an activity line from.
 */
export function buildTrendSeries(
  currency: string,
  snapshots: NetWorthSnapshot[],
  transactions: Transaction[],
  today: { date: string; value: number } | null,
): TrendPoint[] {
  const byDay = new Map<string, TrendTransactionSummary[]>();
  for (const tx of transactions) {
    const amount = signedDelta(tx, currency);
    if (amount === 0) continue;
    const list = byDay.get(tx.date) ?? [];
    list.push({
      id: tx.id,
      description: tx.description,
      type: tx.type,
      amount,
    });
    byDay.set(tx.date, list);
  }
  const dayDelta = (date: string) =>
    (byDay.get(date) ?? []).reduce((s, t) => s + t.amount, 0);

  const points = new Map<string, TrendPoint>();

  if (today) {
    const dates = Array.from(new Set([...byDay.keys(), today.date])).sort();
    const values = walkFromAnchor(dates, today.date, today.value, dayDelta);
    dates.forEach((date, i) => {
      const isToday = date === today.date;
      const txs = isToday ? undefined : byDay.get(date);
      points.set(date, {
        date,
        value: values[i],
        kind: isToday ? 'snapshot' : 'activity',
        source: isToday ? 'live' : undefined,
        delta: txs ? txs.reduce((s, t) => s + t.amount, 0) : undefined,
        transactions: txs,
      });
    });
  }

  // Snapshots are independent checkpoints, always shown with their own
  // stored value — overriding the activity line's value on their own date
  // (see the function doc), never on any other date.
  for (const s of snapshots) {
    const value = s.byCurrency[currency];
    if (value === undefined) continue;
    points.set(s.snapshotDate, {
      date: s.snapshotDate,
      value,
      kind: 'snapshot',
      source: s.source,
    });
  }

  return Array.from(points.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Like {@link buildTrendSeries}, but combines every currency into a single
 * line converted to `targetCurrency` via `rates` (see `lib/currency.ts`
 * `convert()`) — a "total net worth in USD" view instead of one line per
 * currency. Same anchor-at-`today`/backward-walk design and the same
 * independent-snapshot-overlay behavior, just summed across currencies
 * after conversion instead of filtered to one.
 *
 * A transaction or snapshot that touches a currency `rates` doesn't cover
 * is dropped entirely rather than partially summed — a total silently
 * missing one leg is more misleading than a gap in the chart. Callers
 * should only build this series once rates are actually available (mirror
 * AccountsPage's estimated-total gating on `useRatesState`); treating a
 * missing rate as 1:1 would misreport net worth.
 */
export function buildTotalTrendSeries(
  snapshots: NetWorthSnapshot[],
  transactions: Transaction[],
  today: { date: string; value: number } | null,
  targetCurrency: string,
  rates: RateMap,
): TrendPoint[] {
  const byDay = new Map<string, TrendTransactionSummary[]>();
  for (const tx of transactions) {
    const currencies = new Set<string>([tx.currency]);
    if (tx.counterCurrency) currencies.add(tx.counterCurrency);

    let total = 0;
    let convertible = true;
    for (const ccy of currencies) {
      const raw = signedDelta(tx, ccy);
      if (raw === 0) continue;
      const converted = convert(raw, ccy, targetCurrency, rates);
      if (converted === null) {
        convertible = false;
        break;
      }
      total += converted;
    }
    if (!convertible || total === 0) continue;

    const list = byDay.get(tx.date) ?? [];
    list.push({
      id: tx.id,
      description: tx.description,
      type: tx.type,
      amount: total,
    });
    byDay.set(tx.date, list);
  }
  const dayDelta = (date: string) =>
    (byDay.get(date) ?? []).reduce((s, t) => s + t.amount, 0);

  const points = new Map<string, TrendPoint>();

  if (today) {
    const dates = Array.from(new Set([...byDay.keys(), today.date])).sort();
    const values = walkFromAnchor(dates, today.date, today.value, dayDelta);
    dates.forEach((date, i) => {
      const isToday = date === today.date;
      const txs = isToday ? undefined : byDay.get(date);
      points.set(date, {
        date,
        value: values[i],
        kind: isToday ? 'snapshot' : 'activity',
        source: isToday ? 'live' : undefined,
        delta: txs ? txs.reduce((s, t) => s + t.amount, 0) : undefined,
        transactions: txs,
      });
    });
  }

  for (const s of snapshots) {
    let total = 0;
    let convertible = true;
    for (const [ccy, value] of Object.entries(s.byCurrency)) {
      const converted = convert(value, ccy, targetCurrency, rates);
      if (converted === null) {
        convertible = false;
        break;
      }
      total += converted;
    }
    if (!convertible) continue;
    points.set(s.snapshotDate, {
      date: s.snapshotDate,
      value: total,
      kind: 'snapshot',
      source: s.source,
    });
  }

  return Array.from(points.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
