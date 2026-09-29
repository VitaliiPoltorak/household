import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import { useHousehold } from '../contexts/HouseholdContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Section } from '../components/dashboard/Section';
import { NetWorthTrendChart } from '../components/reports/NetWorthTrendChart';
import { formatMoney } from '../lib/money';
import {
  buildTrendSeries,
  buildTotalTrendSeries,
} from '../lib/net-worth-trend';
import { useRatesState, convert } from '../hooks/useRates';
import type { RateMap } from '../lib/currency';
import type { NetWorthSnapshot, Transaction } from '../types/api';

const CURRENCIES = ['UAH', 'USD', 'EUR'];
const TOTAL_CURRENCY = 'USD';
const NO_RATES_NEEDED: RateMap = {};
const EMPTY: NetWorthSnapshot[] = [];
const EMPTY_TX: Transaction[] = [];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NetWorthHistoryPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const hid = activeHousehold?.id;
  const qc = useQueryClient();

  const [showEntry, setShowEntry] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editTarget, setEditTarget] = useState<NetWorthSnapshot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NetWorthSnapshot | null>(
    null,
  );

  const { data: snapshots = EMPTY, isLoading } = useQuery({
    queryKey: ['net-worth-snapshots', hid],
    queryFn: () => financeApi.getNetWorthSnapshots(hid!),
    enabled: !!hid,
  });

  // Trend enrichment (#379 follow-up, corrected by #387 fallout) — the chart
  // also plots one point per day with transaction activity. That line is
  // anchored solely at the live "today" total and walked backward through
  // transactions (see buildTrendSeries) — it never chains through a
  // persisted snapshot, so it can't inherit an unrelated hand-entered
  // number the moment real account tracking begins. Fetched independently
  // of the snapshots for the same reason: bounding the range by the
  // earliest snapshot date used to tie the two together.
  const { data: netWorth } = useQuery({
    queryKey: ['net-worth-live', hid],
    queryFn: () => financeApi.getNetWorth(hid!),
    enabled: !!hid,
  });

  const { data: trendTransactions = EMPTY_TX } = useQuery({
    queryKey: ['transactions', hid, 'net-worth-trend'],
    queryFn: () => financeApi.getTransactions(hid!, { to: todayStr() }),
    enabled: !!hid,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['net-worth-snapshots', hid] });

  // Manual entries only — the server rejects deleting an auto snapshot,
  // since the scheduler just recreates it next month (#379 follow-up).
  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeApi.deleteNetWorthSnapshot(id, hid!),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });

  const closeEntry = () => {
    setShowEntry(false);
    setEditTarget(null);
  };

  // A currency shows up in the trend the moment any snapshot carries it —
  // households that changed their currency mix over time just get gaps
  // rather than a chart that silently drops history.
  const currencies = useMemo(() => {
    const set = new Set<string>();
    snapshots.forEach((s) =>
      Object.keys(s.byCurrency).forEach((c) => set.add(c)),
    );
    return Array.from(set).sort();
  }, [snapshots]);

  const sortedForList = useMemo(
    () =>
      [...snapshots].sort((a, b) => (a.snapshotDate < b.snapshotDate ? 1 : -1)),
    [snapshots],
  );

  // Combined "Total (USD)" line (#389 follow-up) — converts every currency
  // via live PrivatBank rates (same primitive AccountsPage's estimated total
  // uses, see hooks/useRates.ts) and sums them. Only fetched when a currency
  // other than the target actually needs converting; convert() is the
  // identity for same-currency amounts, so a USD-only household never waits
  // on a rates fetch for its own total.
  //
  // Hidden entirely for a single-currency household (mirrors AccountsPage's
  // grand-total gating) — a converted total next to the one currency it's
  // converted from is a redundant number, not a new one.
  const showTotal = currencies.length > 1;
  const ratesNeeded = showTotal && currencies.some((c) => c !== TOTAL_CURRENCY);
  const ratesState = useRatesState(ratesNeeded);
  const canShowTotal =
    showTotal &&
    (ratesState.status === 'ready' || ratesState.status === 'not-needed');
  const ratesForTotal: RateMap =
    ratesState.status === 'ready' ? ratesState.rates : NO_RATES_NEEDED;

  // null = couldn't convert every currency this row carries — shown as a gap
  // rather than a silently wrong partial total.
  const totalsByRow = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const s of sortedForList) {
      if (!canShowTotal) {
        map.set(s.id, null);
        continue;
      }
      let total = 0;
      let ok = true;
      for (const [ccy, v] of Object.entries(s.byCurrency)) {
        const converted = convert(v, ccy, TOTAL_CURRENCY, ratesForTotal);
        if (converted === null) {
          ok = false;
          break;
        }
        total += converted;
      }
      map.set(s.id, ok ? total : null);
    }
    return map;
  }, [sortedForList, canShowTotal, ratesForTotal]);

  const totalTodayAnchor = useMemo(() => {
    if (!canShowTotal || !netWorth) return null;
    let total = 0;
    for (const [ccy, v] of Object.entries(netWorth.byCurrency)) {
      const converted = convert(v, ccy, TOTAL_CURRENCY, ratesForTotal);
      if (converted === null) return null;
      total += converted;
    }
    return { date: todayStr(), value: total };
  }, [canShowTotal, netWorth, ratesForTotal]);

  const totalSeries = useMemo(
    () =>
      canShowTotal
        ? buildTotalTrendSeries(
            snapshots,
            trendTransactions,
            totalTodayAnchor,
            TOTAL_CURRENCY,
            ratesForTotal,
          )
        : [],
    [
      canShowTotal,
      snapshots,
      trendTransactions,
      totalTodayAnchor,
      ratesForTotal,
    ],
  );

  if (!hid) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('common.selectHousehold')}
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('netWorthHistory.title')}
        </h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowBulk(true)}
          >
            {t('netWorthHistory.bulkAdd')}
          </Button>
          <Button size="sm" onClick={() => setShowEntry(true)}>
            {t('netWorthHistory.addEntry')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('common.loading')}
        </p>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('netWorthHistory.empty')}
        </p>
      ) : (
        <>
          <Section title={t('netWorthHistory.trend')}>
            <div className="space-y-6">
              {ratesNeeded && ratesState.status === 'loading' && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('netWorthHistory.rates.loading')}
                </p>
              )}
              {ratesNeeded && ratesState.status === 'failed' && (
                <p
                  className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
                  title={t('netWorthHistory.rates.unavailableDesc')}
                >
                  {t('netWorthHistory.rates.unavailable')}
                </p>
              )}
              {canShowTotal && totalSeries.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('netWorthHistory.totalUsd')}
                    {ratesState.status === 'ready' &&
                      ratesState.source === 'cache' && (
                        <span className="text-amber-500 dark:text-amber-400">
                          ({t('netWorthHistory.rates.cached')})
                        </span>
                      )}
                  </p>
                  <NetWorthTrendChart
                    data={totalSeries}
                    formatValue={(n) => formatMoney(n, TOTAL_CURRENCY)}
                  />
                </div>
              )}
              {currencies.map((ccy) => {
                const todayAnchor =
                  netWorth?.byCurrency[ccy] !== undefined
                    ? { date: todayStr(), value: netWorth.byCurrency[ccy] }
                    : null;
                return (
                  <div key={ccy}>
                    <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                      {ccy}
                    </p>
                    <NetWorthTrendChart
                      data={buildTrendSeries(
                        ccy,
                        snapshots,
                        trendTransactions,
                        todayAnchor,
                      )}
                      formatValue={(n) => formatMoney(n, ccy)}
                    />
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={t('netWorthHistory.history')}>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
              {sortedForList.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <button
                    type="button"
                    onClick={() => setEditTarget(s)}
                    className="flex flex-1 items-center justify-between gap-3 px-4 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {s.snapshotDate}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          s.source === 'auto'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {s.source === 'auto'
                          ? t('netWorthHistory.auto')
                          : t('netWorthHistory.manual')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-sm text-gray-700 dark:text-gray-300">
                      {Object.entries(s.byCurrency).map(([ccy, v]) => (
                        <span key={ccy}>{formatMoney(v, ccy)}</span>
                      ))}
                      {totalsByRow.get(s.id) != null && (
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          ≈{' '}
                          {formatMoney(totalsByRow.get(s.id)!, TOTAL_CURRENCY)}
                        </span>
                      )}
                    </div>
                  </button>
                  {s.source === 'manual' && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(s)}
                      title={t('common.delete')}
                      className="mr-3 text-sm text-gray-400 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      🗑
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {(showEntry || editTarget) && (
        <EntryModal
          hid={hid}
          initial={editTarget}
          onClose={closeEntry}
          onSaved={() => {
            invalidate();
            closeEntry();
          }}
        />
      )}

      {showBulk && (
        <BulkImportModal
          hid={hid}
          onClose={() => setShowBulk(false)}
          onSaved={() => {
            invalidate();
            setShowBulk(false);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('netWorthHistory.deleteTitle')}
          body={t('netWorthHistory.deleteBody')}
          confirmLabel={t('common.delete')}
          confirming={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          details={
            <dl className="rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-gray-800">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">
                  {t('transactions.date')}
                </dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {deleteTarget.snapshotDate}
                </dd>
              </div>
              {Object.entries(deleteTarget.byCurrency).map(([ccy, v]) => (
                <div key={ccy} className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">{ccy}</dt>
                  <dd className="font-mono text-gray-900 dark:text-gray-100">
                    {formatMoney(v, ccy)}
                  </dd>
                </div>
              ))}
            </dl>
          }
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Add / edit a single entry — the same upsert-by-date endpoint handles both
// (#379): editing is just re-submitting for a date that already has a row.
// ──────────────────────────────────────────────
function EntryModal({
  hid,
  initial,
  onClose,
  onSaved,
}: {
  hid: string;
  initial: NetWorthSnapshot | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(
    initial?.snapshotDate ?? new Date().toISOString().split('T')[0],
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (initial) {
      for (const [ccy, v] of Object.entries(initial.byCurrency))
        init[ccy] = String(v);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const byCurrency: Record<string, number> = {};
    for (const ccy of CURRENCIES) {
      const raw = amounts[ccy];
      if (!raw) continue;
      const n = parseFloat(raw);
      if (Number.isFinite(n)) byCurrency[ccy] = n;
    }
    if (Object.keys(byCurrency).length === 0) {
      setError(t('netWorthHistory.needOneCurrency'));
      return;
    }
    setSaving(true);
    try {
      await financeApi.createNetWorthSnapshot(hid, { date, byCurrency });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        initial ? t('netWorthHistory.editEntry') : t('netWorthHistory.addEntry')
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <Input
          label={t('transactions.date')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          autoFocus
        />
        {CURRENCIES.map((ccy) => (
          <Input
            key={ccy}
            label={ccy}
            type="number"
            step="0.01"
            value={amounts[ccy] ?? ''}
            onChange={(e) =>
              setAmounts((a) => ({ ...a, [ccy]: e.target.value }))
            }
            placeholder="0.00"
          />
        ))}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t('netWorthHistory.entryHint')}
        </p>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Bulk backfill — importing a year of pre-app history in one round trip
// instead of typing it in one month at a time (#379).
// ──────────────────────────────────────────────
interface BulkRow {
  id: string;
  date: string;
  amounts: Record<string, string>;
}

let bulkRowSeq = 0;
function newBulkRow(): BulkRow {
  bulkRowSeq += 1;
  return { id: `row-${bulkRowSeq}`, date: '', amounts: {} };
}

function BulkImportModal({
  hid,
  onClose,
  onSaved,
}: {
  hid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BulkRow[]>(() => [
    newBulkRow(),
    newBulkRow(),
    newBulkRow(),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDate = (id: string, date: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, date } : r)));
  const updateAmount = (id: string, ccy: string, value: string) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === id ? { ...r, amounts: { ...r.amounts, [ccy]: value } } : r,
      ),
    );
  const removeRow = (id: string) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, newBulkRow()]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const snapshots: { date: string; byCurrency: Record<string, number> }[] =
      [];
    for (const row of rows) {
      if (!row.date) continue;
      const byCurrency: Record<string, number> = {};
      for (const ccy of CURRENCIES) {
        const raw = row.amounts[ccy];
        if (!raw) continue;
        const n = parseFloat(raw);
        if (Number.isFinite(n)) byCurrency[ccy] = n;
      }
      if (Object.keys(byCurrency).length === 0) continue;
      snapshots.push({ date: row.date, byCurrency });
    }
    if (snapshots.length === 0) {
      setError(t('netWorthHistory.needOneRow'));
      return;
    }
    setSaving(true);
    try {
      await financeApi.createNetWorthSnapshotsBulk(hid, { snapshots });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('netWorthHistory.bulkAdd')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t('netWorthHistory.bulkHint')}
        </p>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.id}
              className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    id={`bulk-date-${row.id}`}
                    label={t('transactions.date')}
                    type="date"
                    value={row.date}
                    onChange={(e) => updateDate(row.id, e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="mb-2 text-sm text-gray-400 hover:text-red-400"
                  title={t('common.delete')}
                >
                  🗑
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {CURRENCIES.map((ccy) => (
                  <div key={ccy} className="w-24">
                    <Input
                      id={`bulk-${ccy}-${row.id}`}
                      label={ccy}
                      type="number"
                      step="0.01"
                      value={row.amounts[ccy] ?? ''}
                      onChange={(e) =>
                        updateAmount(row.id, ccy, e.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          {t('netWorthHistory.addRow')}
        </Button>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
