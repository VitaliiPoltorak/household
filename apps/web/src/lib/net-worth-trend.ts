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
  /** Net change from that day's transactions, if any (present on both
   *  kinds — a snapshot day can also have same-day transactions). */
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
 * keeps the anchor's value but still carries that day's transaction list
 * (if any) for the tooltip.
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
    const txs = byDay.get(date);
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
