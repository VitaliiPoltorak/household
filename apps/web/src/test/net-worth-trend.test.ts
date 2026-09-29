import { buildTrendSeries } from '../lib/net-worth-trend';
import type { NetWorthSnapshot, Transaction } from '../types/api';

const snapshot = (
  date: string,
  uah: number,
  source: NetWorthSnapshot['source'] = 'auto',
): NetWorthSnapshot => ({
  id: `snap-${date}`,
  householdId: 'hh-1',
  snapshotDate: date,
  byCurrency: { UAH: uah },
  source,
  createdAt: `${date}T00:00:00Z`,
  updatedAt: `${date}T00:00:00Z`,
});

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  householdId: 'hh-1',
  accountId: 'acc-1',
  type: 'income',
  amount: 100,
  currency: 'UAH',
  categoryId: null,
  incomeSourceId: null,
  description: null,
  date: '2026-01-01',
  createdBy: 'user-1',
  transferPairId: null,
  transferDirection: null,
  createdAt: '2026-01-01T00:00:00Z',
  counterAccountId: null,
  counterTransactionId: null,
  counterAmount: null,
  counterCurrency: null,
  ...overrides,
});

describe('buildTrendSeries', () => {
  it('returns just the snapshot points when there is no transaction activity', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000), snapshot('2026-07-01', 1500)],
      [],
      null,
    );
    expect(series).toEqual([
      {
        date: '2026-06-01',
        value: 1000,
        kind: 'snapshot',
        source: 'auto',
        delta: undefined,
        transactions: undefined,
      },
      {
        date: '2026-07-01',
        value: 1500,
        kind: 'snapshot',
        source: 'auto',
        delta: undefined,
        transactions: undefined,
      },
    ]);
  });

  it('without a live "today", transactions produce no activity points — only snapshots are shown', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [
        tx({ id: 't1', date: '2026-06-05', type: 'income', amount: 200 }),
        tx({ id: 't2', date: '2026-06-10', type: 'expense', amount: 50 }),
      ],
      null,
    );
    // There is no trustworthy anchor to derive an activity line from — a
    // snapshot is never used as one (see the regression test below for why).
    expect(series).toEqual([
      {
        date: '2026-06-01',
        value: 1000,
        kind: 'snapshot',
        source: 'auto',
        delta: undefined,
        transactions: undefined,
      },
    ]);
  });

  it("walks backward from today, subtracting each day's net delta, ignoring any snapshot", () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)], // must have zero effect on the activity line
      [
        tx({ id: 't1', date: '2026-06-05', type: 'income', amount: 200 }),
        tx({ id: 't2', date: '2026-06-10', type: 'expense', amount: 50 }),
      ],
      { date: '2026-06-15', value: 1150 },
    );
    // Nothing happens between 06-10 and today (06-15), so 06-10's value
    // (inclusive of its own -50 expense) equals today's: 1150. 06-05's value
    // (inclusive of its own +200 income) is what, ADDED to 06-10's -50 delta,
    // produces 1150 — i.e. 1150 - (-50) = 1200.
    expect(
      series
        .filter((p) => p.kind === 'activity' || p.source === 'live')
        .map((p) => [p.date, p.value, p.kind]),
    ).toEqual([
      ['2026-06-05', 1200, 'activity'],
      ['2026-06-10', 1150, 'activity'],
      ['2026-06-15', 1150, 'snapshot'],
    ]);
  });

  it('merges same-day transactions into one activity point with a summed delta and a transaction list', () => {
    const series = buildTrendSeries(
      'UAH',
      [],
      [
        tx({
          id: 't1',
          date: '2026-06-05',
          type: 'income',
          amount: 200,
          description: 'Salary',
        }),
        tx({
          id: 't2',
          date: '2026-06-05',
          type: 'expense',
          amount: 80,
          description: 'Groceries',
        }),
      ],
      { date: '2026-06-10', value: 1120 },
    );
    const day = series.find((p) => p.date === '2026-06-05')!;
    // Nothing happens between 06-05 and today (06-10), so 06-05's value —
    // inclusive of its own net +120 (200 - 80) — equals today's: 1120.
    expect(day.value).toBe(1120);
    expect(day.delta).toBe(120);
    expect(day.transactions).toHaveLength(2);
    expect(day.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 't1', amount: 200 }),
        expect.objectContaining({ id: 't2', amount: -80 }),
      ]),
    );
  });

  // The exact production bug (#387 fallout): a household hand-backfilled
  // monthly totals, then started real account tracking on 2026-08-30 by
  // initializing accounts via several "adjust balance" corrections. The old
  // algorithm chained those corrections onto the unrelated 2026-08-01 manual
  // figure (117011 + 115870 = 232881, a near-doubling). The activity line
  // must instead be self-consistent, derived only from today's live total.
  it('does not double-count a lump-sum correction against an unrelated manual entry', () => {
    const series = buildTrendSeries(
      'UAH',
      [
        snapshot('2026-08-01', 117011, 'manual'),
        snapshot('2026-09-01', 118500, 'manual'),
      ],
      [
        tx({
          id: 'c1',
          date: '2026-08-30',
          type: 'adjustment',
          amount: 115870,
        }),
      ],
      { date: '2026-09-15', value: 118600 },
    );
    const correctionDay = series.find((p) => p.date === '2026-08-30')!;
    // Nothing else happens between the correction (08-30) and today
    // (09-15), so 08-30's value — inclusive of the +115870 correction —
    // equals today's: 118600. Nowhere near the old bug's 232,881
    // (117011 + 115870, chained onto an unrelated manual figure), and
    // nothing here is derived from either manual snapshot at all.
    expect(correctionDay.value).toBe(118600);
    expect(correctionDay.kind).toBe('activity');
    // The manual snapshots are untouched, on their own dates only.
    expect(series.find((p) => p.date === '2026-08-01')?.value).toBe(117011);
    expect(series.find((p) => p.date === '2026-09-01')?.value).toBe(118500);
  });

  it('extends the series with a live "today" anchor when provided', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [tx({ id: 't1', date: '2026-06-15', type: 'income', amount: 300 })],
      { date: '2026-06-30', value: 1300 },
    );
    const today = series.find((p) => p.date === '2026-06-30')!;
    expect(today.kind).toBe('snapshot');
    expect(today.source).toBe('live');
    expect(today.value).toBe(1300);
  });

  it('does not duplicate the live anchor when it lands on an existing snapshot date', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [],
      { date: '2026-06-01', value: 999 }, // ignored — the snapshot wins
    );
    expect(series).toHaveLength(1);
    expect(series[0].value).toBe(1000);
    expect(series[0].source).toBe('auto');
  });

  it('a same-currency transfer nets to zero and produces no point', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [
        tx({
          id: 't1',
          date: '2026-06-05',
          type: 'transfer',
          amount: 500,
          currency: 'UAH',
          counterAmount: 500,
          counterCurrency: 'UAH',
        }),
      ],
      null,
    );
    expect(series).toHaveLength(1); // only the snapshot
  });

  it('a cross-currency transfer only affects the leg currency being charted', () => {
    const transferTx = tx({
      id: 't1',
      date: '2026-06-05',
      type: 'transfer',
      amount: 500,
      currency: 'UAH',
      counterAmount: 12,
      counterCurrency: 'USD',
    });

    // Nothing happens between the transfer (06-05) and "today" (06-06) in
    // either currency, so each leg's 06-05 value equals its own today value.
    const uah = buildTrendSeries('UAH', [], [transferTx], {
      date: '2026-06-06',
      value: 500,
    });
    expect(uah.find((p) => p.date === '2026-06-05')?.value).toBe(500);

    const usd = buildTrendSeries('USD', [], [transferTx], {
      date: '2026-06-06',
      value: 12,
    });
    expect(usd.find((p) => p.date === '2026-06-05')?.value).toBe(12);
  });

  it('ignores transactions in a currency the chart is not tracking', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [
        tx({
          id: 't1',
          date: '2026-06-05',
          type: 'income',
          amount: 200,
          currency: 'USD',
        }),
      ],
      null,
    );
    expect(series).toHaveLength(1);
  });

  it('returns an empty series when there is no anchor at all for the currency', () => {
    expect(
      buildTrendSeries('EUR', [snapshot('2026-06-01', 1000)], [], null),
    ).toEqual([]);
  });
});
