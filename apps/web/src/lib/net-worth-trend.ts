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

interface Anchor {
  date: string;
  value: number;
  source: NetWorthSnapshot['source'] | 'live';
}

/**
 * Builds one currency's trend series: the persisted snapshot points plus one
 * point per day with transaction activity in that currency (same-day
 * transactions merged into a single point).
 *
 * Anchors (snapshots, plus an optional live "today" total) are the only
 * dates whose value is authoritative. Every other date's value is derived
 * by walking day-by-day from the nearest earlier anchor, adding each day's
 * net transaction delta — or, for dates before the earliest anchor, walking
 * backward from it and subtracting. A date that coincides with an anchor
 * keeps the anchor's value and does NOT also carry that day's transaction
 * list — the anchor is authoritative regardless of what else happened that
 * day, and showing a same-day delta next to it reads as something still to
 * be added/subtracted, which it isn't (see the comment at the return below).
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

  const anchors: Anchor[] = snapshots
    .filter((s) => s.byCurrency[currency] !== undefined)
    .map((s) => ({
      date: s.snapshotDate,
      value: s.byCurrency[currency],
      source: s.source,
    }));
  if (today && !anchors.some((a) => a.date === today.date)) {
    anchors.push({ date: today.date, value: today.value, source: 'live' });
  }
  if (anchors.length === 0) return [];
  anchors.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const allDates = Array.from(
    new Set([...anchors.map((a) => a.date), ...byDay.keys()]),
  ).sort();
  const anchorByDate = new Map(anchors.map((a) => [a.date, a]));
  const firstAnchorIdx = allDates.findIndex((d) => anchorByDate.has(d));

  const dayDelta = (date: string) =>
    (byDay.get(date) ?? []).reduce((s, t) => s + t.amount, 0);

  const values = new Array<number>(allDates.length);
  values[firstAnchorIdx] = anchorByDate.get(allDates[firstAnchorIdx])!.value;

  for (let i = firstAnchorIdx + 1; i < allDates.length; i++) {
    const anchor = anchorByDate.get(allDates[i]);
    values[i] = anchor ? anchor.value : values[i - 1] + dayDelta(allDates[i]);
  }
  for (let i = firstAnchorIdx - 1; i >= 0; i--) {
    values[i] = values[i + 1] - dayDelta(allDates[i + 1]);
  }

  return allDates.map((date, i) => {
    const anchor = anchorByDate.get(date);
    // Same-day transactions are only surfaced for an 'activity' point, where
    // their sum IS how that point's value was derived from the previous one
    // — showing "Change: X" next to it reads as "this total = previous ±X".
    // A 'snapshot' point's value is authoritative (typed by the user, or the
    // live/auto total) regardless of what else happened that day; showing
    // the same "Change: X" line there previously read as if that amount
    // still needed to be added to or subtracted from the displayed total,
    // which it doesn't — so a coinciding day's transactions are dropped
    // here rather than attached to a snapshot point.
    const txs = anchor ? undefined : byDay.get(date);
    return {
      date,
      value: values[i],
      kind: anchor ? 'snapshot' : 'activity',
      source: anchor?.source,
      delta: txs ? txs.reduce((s, t) => s + t.amount, 0) : undefined,
      transactions: txs,
    };
  });
}
