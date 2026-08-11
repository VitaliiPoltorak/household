import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import { CreateHouseholdModal } from '../components/households/CreateHouseholdModal';
import { StatCard } from '../components/dashboard/StatCard';
import { Section } from '../components/dashboard/Section';
import { formatMoney } from '../lib/money';
import { useRatesState, convert, BASE_CURRENCY_KEY } from '../hooks/useRates';

const fmt = (n: number, currency = 'UAH') => formatMoney(n, currency, 'uk-UA');

export function DashboardPage() {
  const { t } = useTranslation();
  const { activeHousehold, setActiveHousehold, refetch } = useHousehold();
  const [showCreate, setShowCreate] = useState(false);
  // Same key as AccountsPage — a change on either page is visible on the other
  // once TanStack Query refetches. Live cross-tab sync via 'storage' event so
  // "USD" chosen on Accounts flips this card without a hard reload.
  const [baseCurrency, setBaseCurrency] = useState<string>(
    () => localStorage.getItem(BASE_CURRENCY_KEY) ?? 'UAH',
  );
  const hid = activeHousehold?.id;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === BASE_CURRENCY_KEY && e.newValue) setBaseCurrency(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const { data: summary } = useQuery({
    queryKey: ['accounts', 'summary', hid],
    queryFn: () => financeApi.getSummary(hid!),
    enabled: !!hid,
  });

  const { data: upcoming = [] } = useQuery({
    queryKey: ['recurring-payments', 'upcoming', hid],
    queryFn: () => financeApi.getUpcoming(hid!, 30),
    enabled: !!hid,
  });

  const now = new Date();
  const { data: monthly } = useQuery({
    queryKey: ['reports', 'monthly', hid, now.getFullYear(), now.getMonth() + 1],
    queryFn: () => financeApi.getMonthlyReport(hid!, now.getFullYear(), now.getMonth() + 1),
    enabled: !!hid,
  });

  // Per-currency roll-up of the account list — the backend `totalBalance` is
  // a naïve sum across currencies, meaningless when accounts span more than
  // one. We compute the honest per-currency breakdown here and, when rates
  // are available, a converted grand total in the user's chosen base.
  const accounts = summary?.accounts ?? [];
  const byCurrency: Record<string, number> = {};
  for (const a of accounts) {
    byCurrency[a.currency] = (byCurrency[a.currency] ?? 0) + Number(a.balance);
  }
  const currencies = Object.keys(byCurrency);
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const isMulti = currencies.length > 1;

  const ratesNeeded = accounts.some((a) => a.currency !== baseCurrency);
  const ratesState = useRatesState(ratesNeeded);

  // Grand total in base currency — same discipline as AccountsPage: if any
  // leg is missing a rate, we refuse to show a partially-converted number.
  let grandTotal: number | null = 0;
  if (accounts.length === 0) {
    grandTotal = 0;
  } else if (ratesState.status === 'ready') {
    for (const a of accounts) {
      const c = convert(Number(a.balance), a.currency, baseCurrency, ratesState.rates);
      if (c === null) { grandTotal = null; break; }
      grandTotal += c;
    }
  } else if (ratesState.status !== 'not-needed') {
    // 'loading' or 'failed' — no honest number to display.
    grandTotal = null;
  } else {
    // 'not-needed' — all accounts share baseCurrency, so the sum is already
    // in baseCurrency and needs no rates.
    grandTotal = accounts.reduce((s, a) => s + Number(a.balance), 0);
  }

  // Total balance StatCard: prefer the converted grand total; fall back to
  // the single-currency sum when there's only one; otherwise show a
  // "unavailable" placeholder rather than the backend's meaningless sum.
  const totalBalanceValue: string = (() => {
    if (!summary) return '—';
    if (accounts.length === 0) return fmt(0, baseCurrency);
    if (singleCurrency) return fmt(byCurrency[singleCurrency], singleCurrency);
    if (grandTotal !== null) return fmt(grandTotal, baseCurrency);
    return t('dashboard.rates.unavailableShort');
  })();

  // Small hint under the Total balance card explaining the number.
  const totalBalanceSubtitle: string | null = (() => {
    if (!isMulti) return null;
    if (ratesState.status === 'ready' && grandTotal !== null) {
      return ratesState.source === 'cache'
        ? t('dashboard.convertedFromCached', { count: currencies.length })
        : t('dashboard.convertedFrom', { count: currencies.length });
    }
    if (ratesState.status === 'loading') return t('dashboard.rates.loading');
    return t('dashboard.rates.unavailableDesc');
  })();

  // Monthly income/expense hint. Note: `financeApi.getMonthlyReport` returns
  // `totalIncome` / `totalExpense` as a naïve SUM across currencies with no
  // currency dimension (see reports.service.ts + typeorm-transaction-query
  // repository — SUM(amount) grouped by day only). Until the backend surfaces
  // a per-currency breakdown, we can't honestly convert these; show a
  // "mixed currencies" caveat when the household has accounts in >1 currency
  // so the user knows the number is arithmetically mixed rather than
  // trustworthy in one currency.
  const monthlySubtitle: string | null = isMulti ? t('dashboard.mixedCurrencies') : null;

  if (!activeHousehold) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-gray-500 dark:text-gray-400">You don't have any household yet.</p>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500"
        >
          Create your first home
        </button>
        {showCreate && (
          <CreateHouseholdModal
            onClose={() => setShowCreate(false)}
            onCreate={(h) => { setActiveHousehold(h); refetch(); setShowCreate(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{activeHousehold.name}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          + New home
        </button>
        {showCreate && (
          <CreateHouseholdModal
            onClose={() => setShowCreate(false)}
            onCreate={(h) => { setActiveHousehold(h); refetch(); setShowCreate(false); }}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('dashboard.totalBalance')}
          value={totalBalanceValue}
          color="blue"
          subtitle={totalBalanceSubtitle}
        />
        <StatCard
          label={t('dashboard.incomeThisMonth')}
          value={monthly ? fmt(monthly.totalIncome) : '—'}
          color="green"
          subtitle={monthlySubtitle}
        />
        <StatCard
          label={t('dashboard.expensesThisMonth')}
          value={monthly ? fmt(monthly.totalExpense) : '—'}
          color="red"
          subtitle={monthlySubtitle}
        />
      </div>

      {/* Per-currency breakdown — always visible when the household spans >1
          currency; the honest raw totals never depend on PrivatBank. */}
      {isMulti && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('dashboard.byCurrency')}:
          </span>
          {currencies.map((ccy) => (
            <span key={ccy} className="text-sm text-gray-500 dark:text-gray-400">
              {ccy}:{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {fmt(byCurrency[ccy], ccy)}
              </span>
            </span>
          ))}
        </div>
      )}

      {summary && summary.accounts.length > 0 && (
        <Section title={t('dashboard.accounts')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.accounts.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{a.type}</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{a.name}</p>
                <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-200">{fmt(Number(a.balance), a.currency)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title={t('dashboard.upcomingPayments')}>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
            {upcoming.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{p.nextDueDate} · {p.frequency}</p>
                </div>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(Number(p.amount), p.currency)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
