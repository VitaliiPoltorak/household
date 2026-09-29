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

const snapshotFx = (
  date: string,
  byCurrency: Record<string, number>,
): NetWorthSnapshot => ({
  id: `snap-${date}`,
  householdId: 'hh-1',
  snapshotDate: date,
  byCurrency,
  source: 'auto',
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

  it("walks forward from a snapshot, adding each day's net delta", () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [
        tx({ id: 't1', date: '2026-06-05', type: 'income', amount: 200 }),
        tx({ id: 't2', date: '2026-06-10', type: 'expense', amount: 50 }),
      ],
      null,
    );
    expect(series.map((p) => [p.date, p.value, p.kind])).toEqual([
      ['2026-06-01', 1000, 'snapshot'],
      ['2026-06-05', 1200, 'activity'],
      ['2026-06-10', 1150, 'activity'],
    ]);
  });

  it('merges same-day transactions into one point with a summed delta and a transaction list', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
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
      null,
    );
    const day = series.find((p) => p.date === '2026-06-05')!;
    expect(day.value).toBe(1120); // 1000 + 200 - 80
    expect(day.delta).toBe(120);
    expect(day.transactions).toHaveLength(2);
    expect(day.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 't1', amount: 200 }),
        expect.objectContaining({ id: 't2', amount: -80 }),
      ]),
    );
  });

  it('walks backward from the earliest anchor for activity before it', () => {
    const series = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-10', 1000)],
      [
        tx({ id: 't1', date: '2026-06-05', type: 'income', amount: 200 }),
        tx({ id: 't2', date: '2026-06-08', type: 'expense', amount: 50 }),
      ],
      null,
    );
    // Nothing recorded happens between 06-08 and the 06-10 anchor, so 06-08
    // must equal the anchor (1000). Undoing 06-08's own -50 expense to reach
    // 06-05 means ADDING it back: 1000 - (-50) = 1050.
    expect(series.map((p) => [p.date, p.value])).toEqual([
      ['2026-06-05', 1050],
      ['2026-06-08', 1000],
      ['2026-06-10', 1000],
    ]);
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
    const uah = buildTrendSeries(
      'UAH',
      [snapshot('2026-06-01', 1000)],
      [
        tx({
          id: 't1',
          date: '2026-06-05',
          type: 'transfer',
          amount: 500,
          currency: 'UAH',
          counterAmount: 12,
          counterCurrency: 'USD',
        }),
      ],
      null,
    );
    expect(uah.find((p) => p.date === '2026-06-05')?.value).toBe(500); // 1000 - 500

    const usd = buildTrendSeries(
      'USD',
      [snapshotFx('2026-06-01', { USD: 0 })],
      [
        tx({
          id: 't1',
          date: '2026-06-05',
          type: 'transfer',
          amount: 500,
          currency: 'UAH',
          counterAmount: 12,
          counterCurrency: 'USD',
        }),
      ],
      null,
    );
    expect(usd.find((p) => p.date === '2026-06-05')?.value).toBe(12); // 0 + 12
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
