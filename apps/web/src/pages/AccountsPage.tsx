import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import type { Account } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

const ACCOUNT_TYPES = ['cash', 'bank', 'crypto', 'investment', 'deposit'] as const;
const CURRENCIES = ['UAH', 'USD', 'EUR'];
const BASE_CURRENCY_KEY = 'accounts:baseCurrency';

// ──────────────────────────────────────────────
// Formatting
// ──────────────────────────────────────────────
function fmt(n: number, currency = 'UAH') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

// ──────────────────────────────────────────────
// PrivatBank exchange rates
// ──────────────────────────────────────────────
interface PBRate { ccy: string; base_ccy: string; buy: string; sale: string }

function useExchangeRates() {
  return useQuery<PBRate[]>({
    queryKey: ['privatbank-rates'],
    queryFn: async () => {
      const res = await fetch(
        'https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5',
      );
      if (!res.ok) throw new Error('PrivatBank API error');
      return res.json() as Promise<PBRate[]>;
    },
    staleTime: 30 * 60 * 1000, // 30 min
    retry: 1,
  });
}

/** Convert amount in fromCcy to toCcy using buy rates (all vs UAH) */
function convert(
  amount: number,
  fromCcy: string,
  toCcy: string,
  rates: PBRate[],
): number {
  if (fromCcy === toCcy) return amount;
  const rateMap: Record<string, number> = { UAH: 1 };
  for (const r of rates) {
    rateMap[r.ccy] = parseFloat(r.buy);
  }
  const fromUAH = fromCcy === 'UAH' ? amount : amount * (rateMap[fromCcy] ?? 1);
  return toCcy === 'UAH' ? fromUAH : fromUAH / (rateMap[toCcy] ?? 1);
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export function AccountsPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const [showCreate, setShowCreate] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string>(
    () => localStorage.getItem(BASE_CURRENCY_KEY) ?? 'UAH',
  );

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', hid],
    queryFn: () => financeApi.getAccounts(hid),
    enabled: !!hid,
  });

  const { data: rates = [], dataUpdatedAt } = useExchangeRates();

  const archive = useMutation({
    mutationFn: (id: string) => financeApi.archiveAccount(id, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', hid] }),
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      financeApi.updateAccount(id, hid, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', hid] }),
  });

  // Per-currency totals
  const byCurrency: Record<string, number> = {};
  for (const a of accounts) {
    byCurrency[a.currency] = (byCurrency[a.currency] ?? 0) + Number(a.balance);
  }

  // Grand total in base currency
  const grandTotal = accounts.reduce((sum, a) => {
    return sum + convert(Number(a.balance), a.currency, baseCurrency, rates);
  }, 0);

  const handleBaseCurrencyChange = (c: string) => {
    setBaseCurrency(c);
    localStorage.setItem(BASE_CURRENCY_KEY, c);
  };

  const ratesTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (!activeHousehold) return <p className="text-gray-500">{t('common.selectHousehold')}</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('accounts.title')}</h1>

          {/* Per-currency breakdown */}
          <div className="mt-1 flex flex-wrap gap-3">
            {Object.entries(byCurrency).map(([ccy, total]) => (
              <span key={ccy} className="text-sm text-gray-500">
                {ccy}: <span className="font-semibold text-gray-800">{fmt(total, ccy)}</span>
              </span>
            ))}
          </div>

          {/* Grand total in base currency */}
          {accounts.length > 0 && Object.keys(byCurrency).length > 1 && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400">{t('accounts.estimatedTotal')}:</span>
              <span className="font-bold text-gray-900">{fmt(grandTotal, baseCurrency)}</span>
              <select
                value={baseCurrency}
                onChange={(e) => handleBaseCurrencyChange(e.target.value)}
                className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600"
                title={t('accounts.displayIn')}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {ratesTime && (
                <span className="text-xs text-gray-300">
                  {t('accounts.ratesBy')} {ratesTime}
                </span>
              )}
            </div>
          )}

          {/* Simple total when single currency */}
          {Object.keys(byCurrency).length <= 1 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {t('accounts.total')}:{' '}
              <span className="font-semibold text-gray-800">
                {fmt(Object.values(byCurrency)[0] ?? 0, Object.keys(byCurrency)[0] ?? 'UAH')}
              </span>
            </p>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)}>{t('accounts.new')}</Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <Empty
          text={t('accounts.empty')}
          action={() => setShowCreate(true)}
          actionLabel={t('accounts.addFirst')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              archiveLabel={t('common.archive')}
              onArchive={() => archive.mutate(a.id)}
              onEdit={() => setEditAccount(a)}
              onNameSave={(name) => updateAccount.mutate({ id: a.id, data: { name } })}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal
          hid={hid}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            setShowCreate(false);
          }}
        />
      )}

      {editAccount && (
        <EditAccountModal
          account={editAccount}
          hid={hid}
          onClose={() => setEditAccount(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            setEditAccount(null);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Account card with inline name edit
// ──────────────────────────────────────────────
function AccountCard({ account, archiveLabel, onArchive, onEdit, onNameSave }: {
  account: Account;
  archiveLabel: string;
  onArchive: () => void;
  onEdit: () => void;
  onNameSave: (name: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(account.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) inputRef.current?.select();
  }, [editingName]);

  const save = () => {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== account.name) onNameSave(trimmed);
    setEditingName(false);
  };

  const cancel = () => {
    setNameVal(account.name);
    setEditingName(false);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Badge label={account.type} />
          {editingName ? (
            <input
              ref={inputRef}
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') cancel();
              }}
              className="mt-2 w-full rounded border border-primary-400 px-1 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          ) : (
            <p
              className="mt-2 font-semibold text-gray-900 cursor-text truncate"
              onDoubleClick={() => setEditingName(true)}
              title="Double-click to edit"
            >
              {account.name}
            </p>
          )}
        </div>
        <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="text-gray-400 hover:text-primary-600 text-sm"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={onArchive}
            className="text-gray-400 hover:text-red-400 text-sm"
            title={archiveLabel}
          >
            🗑
          </button>
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-800">
        {fmt(Number(account.balance), account.currency)}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">{account.currency}</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// Create modal
// ──────────────────────────────────────────────
function CreateAccountModal({ hid, onClose, onCreated }: {
  hid: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState('UAH');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await financeApi.createAccount(hid, { name: name.trim(), type, currency });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('accounts.newTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input label={t('accounts.name')} value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t('accounts.namePlaceholder')} required autoFocus />
        <Select label={t('accounts.type')} value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((tp) => <option key={tp} value={tp}>{t(`accounts.types.${tp}`)}</option>)}
        </Select>
        <Select label={t('accounts.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? t('common.saving') : t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Edit modal
// ──────────────────────────────────────────────
function EditAccountModal({ account, hid, onClose, onSaved }: {
  account: Account;
  hid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [currency, setCurrency] = useState(account.currency);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await financeApi.updateAccount(account.id, hid, { name: name.trim(), type, currency });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('accounts.editTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input label={t('accounts.name')} value={name} onChange={(e) => setName(e.target.value)}
          required autoFocus />
        <Select label={t('accounts.type')} value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((tp) => <option key={tp} value={tp}>{t(`accounts.types.${tp}`)}</option>)}
        </Select>
        <Select label={t('accounts.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={saving || !name.trim()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />;
}

function Empty({ text, action, actionLabel }: { text: string; action?: () => void; actionLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="mb-3">{text}</p>
      {action && actionLabel && (
        <Button variant="secondary" size="sm" onClick={action}>{actionLabel}</Button>
      )}
    </div>
  );
}
