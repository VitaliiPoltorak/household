import type { NetWorthSnapshot, Transaction } from '../types/api';

export interface TrendTransactionSummary {
  id: string;
  description: string | null;
  type: Transaction['type'];
  /** Signed effect on this currency's total (see {@link signedDelta}). */
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
    const todayIdx = dates.indexOf(today.date);
    const values = new Array<number>(dates.length);
    values[todayIdx] = today.value;
    for (let i = todayIdx - 1; i >= 0; i--) {
      values[i] = values[i + 1] - dayDelta(dates[i + 1]);
    }
    // Dates after today shouldn't occur (the caller bounds the transaction
    // fetch at today), but a forward pass keeps this correct if one sneaks
    // in (e.g. a clock skew or a future-dated entry).
    for (let i = todayIdx + 1; i < dates.length; i++) {
      values[i] = values[i - 1] + dayDelta(dates[i]);
    }
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
