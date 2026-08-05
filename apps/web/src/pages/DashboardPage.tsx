import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
// import { householdsApi } from '../api/households';
import { CreateHouseholdModal } from '../components/households/CreateHouseholdModal';
import { useState } from 'react';

function fmt(n: number, currency = 'UAH') {
  return new Intl.NumberFormat('uk-UA', { style: 'currency', currency }).format(n);
}

export function DashboardPage() {
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
        <p className="text-gray-500">You don't have any household yet.</p>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
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
        <h1 className="text-2xl font-bold text-gray-900">{activeHousehold.name}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm text-primary-600 hover:text-primary-700"
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

      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total balance"
          value={summary ? fmt(summary.totalBalance) : '—'}
          color="blue"
        />
        <StatCard
          label="Income this month"
          value={monthly ? fmt(monthly.totalIncome) : '—'}
          color="green"
        />
        <StatCard
          label="Expenses this month"
          value={monthly ? fmt(monthly.totalExpense) : '—'}
          color="red"
        />
      </div>

      {/* Accounts */}
      {summary && summary.accounts.length > 0 && (
        <Section title="Accounts">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.accounts.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">{a.type}</p>
                <p className="mt-0.5 font-medium text-gray-900">{a.name}</p>
                <p className="mt-1 text-lg font-bold text-gray-800">{fmt(Number(a.balance), a.currency)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Upcoming payments */}
      {upcoming.length > 0 && (
        <Section title="Upcoming payments (30 days)">
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {upcoming.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.nextDueDate} · {p.frequency}</p>
                </div>
                <span className="font-semibold text-gray-800">{fmt(Number(p.amount), p.currency)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: 'blue' | 'green' | 'red' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-xl p-5 ${colors[color]}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}
