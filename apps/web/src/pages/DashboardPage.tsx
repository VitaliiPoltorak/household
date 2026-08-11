import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import { CreateHouseholdModal } from '../components/households/CreateHouseholdModal';
import { StatCard } from '../components/dashboard/StatCard';
import { Section } from '../components/dashboard/Section';
import { formatMoney } from '../lib/money';

const fmt = (n: number, currency = 'UAH') => formatMoney(n, currency, 'uk-UA');

export function DashboardPage() {
  const { t } = useTranslation();
  const { activeHousehold, setActiveHousehold, refetch } = useHousehold();
  const [showCreate, setShowCreate] = useState(false);
  const hid = activeHousehold?.id;

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
        <StatCard label={t('dashboard.totalBalance')} value={summary ? fmt(summary.totalBalance) : '—'} color="blue" />
        <StatCard label={t('dashboard.incomeThisMonth')} value={monthly ? fmt(monthly.totalIncome) : '—'} color="green" />
        <StatCard label={t('dashboard.expensesThisMonth')} value={monthly ? fmt(monthly.totalExpense) : '—'} color="red" />
      </div>

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
