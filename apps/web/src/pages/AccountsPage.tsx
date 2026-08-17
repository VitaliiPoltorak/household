import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import type { Account, AccountType, Category } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatMoney } from '../lib/money';
import { useRatesState, convert, BASE_CURRENCY_KEY } from '../hooks/useRates';
import { useAccountActions, type QuickTxType } from '../hooks/useAccountActions';
import { useInlineNameEdit } from '../hooks/useInlineNameEdit';

// Persisted view preference (#164). Global across households by design —
// user picks a density once and every household inherits it.
export const ACCOUNTS_VIEW_KEY = 'accounts:view';
type ViewMode = 'grid' | 'list';
const isViewMode = (v: string | null): v is ViewMode => v === 'grid' || v === 'list';

const ACCOUNT_TYPES: readonly AccountType[] = ['cash', 'bank', 'crypto', 'investment', 'deposit'];
const CURRENCIES = ['UAH', 'USD', 'EUR'];

// ──────────────────────────────────────────────
// Formatting
// ──────────────────────────────────────────────
const fmt = (n: number, currency = 'UAH') => formatMoney(n, currency);

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export function AccountsPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const [showCreate, setShowCreate] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<string>(
    () => localStorage.getItem(BASE_CURRENCY_KEY) ?? 'UAH',
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(ACCOUNTS_VIEW_KEY);
    return isViewMode(stored) ? stored : 'grid';
  });

  // Cross-tab sync: a viewMode change in another tab reflects here without
  // a hard reload (same pattern as baseCurrency).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACCOUNTS_VIEW_KEY && isViewMode(e.newValue)) setViewMode(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleViewModeChange = (v: ViewMode) => {
    setViewMode(v);
    localStorage.setItem(ACCOUNTS_VIEW_KEY, v);
  };

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', hid],
    queryFn: () => financeApi.getAccounts(hid),
    enabled: !!hid,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', hid],
    queryFn: () => financeApi.getCategories(hid),
    enabled: !!hid,
  });

  // Backend already sorts by name (accounts.service.ts findAll). Re-sorting
  // client-side with the browser locale drifted from PostgreSQL's collation
  // (#79) — same list looked different across browsers. Rely on server order.
  const sortedAccounts = accounts;

  const ratesNeeded = sortedAccounts.some(a => a.currency !== baseCurrency);
  const ratesState = useRatesState(ratesNeeded);

  const actions = useAccountActions(hid);

  // Per-currency totals
  const byCurrency: Record<string, number> = {};
  for (const a of sortedAccounts) {
    byCurrency[a.currency] = (byCurrency[a.currency] ?? 0) + Number(a.balance);
  }

  // Grand total in base currency — computed only when rates are ready. When
  // convert() returns null for any leg, the whole total is null: we refuse
  // to show a partially-converted number since users can't tell what parts
  // used real rates vs a fallback.
  let grandTotal: number | null = 0;
  if (ratesState.status === 'ready') {
    for (const a of sortedAccounts) {
      const converted = convert(Number(a.balance), a.currency, baseCurrency, ratesState.rates);
      if (converted === null) { grandTotal = null; break; }
      grandTotal += converted;
    }
  } else if (ratesState.status !== 'not-needed') {
    grandTotal = null;
  }

  const handleBaseCurrencyChange = (c: string) => {
    setBaseCurrency(c);
    localStorage.setItem(BASE_CURRENCY_KEY, c);
  };

  const ratesTime = ratesState.status === 'ready'
    ? ratesState.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (!activeHousehold) return <p className="text-gray-500 dark:text-gray-400">{t('common.selectHousehold')}</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('accounts.title')}</h1>

          {/* Per-currency breakdown */}
          <div className="mt-1 flex flex-wrap gap-3">
            {Object.entries(byCurrency).map(([ccy, total]) => (
              <span key={ccy} className="text-sm text-gray-500 dark:text-gray-400">
                {ccy}: <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(total, ccy)}</span>
              </span>
            ))}
          </div>

          {/* Grand total in base currency */}
          {accounts.length > 0 && Object.keys(byCurrency).length > 1 && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-400 dark:text-gray-500">{t('accounts.estimatedTotal')}:</span>
              {ratesState.status === 'ready' && grandTotal !== null ? (
                <>
                  <span className="font-bold text-gray-900 dark:text-gray-100">{fmt(grandTotal, baseCurrency)}</span>
                  <select
                    value={baseCurrency}
                    onChange={(e) => handleBaseCurrencyChange(e.target.value)}
                    className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    title={t('accounts.displayIn')}
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {ratesTime && (
                    <span className="text-xs text-gray-300 dark:text-gray-600">
                      {t('accounts.ratesBy')} {ratesTime}
                      {ratesState.source === 'cache' && (
                        <span className="ml-1 text-amber-500 dark:text-amber-400">({t('accounts.rates.cached')})</span>
                      )}
                    </span>
                  )}
                </>
              ) : ratesState.status === 'loading' ? (
                <span className="text-xs text-gray-400 dark:text-gray-500">{t('accounts.loading')}</span>
              ) : (
                <span
                  className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
                  title={t('accounts.rates.unavailableDesc')}
                >
                  {t('accounts.rates.unavailable')}
                </span>
              )}
            </div>
          )}

          {/* Simple total when single currency */}
          {Object.keys(byCurrency).length <= 1 && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('accounts.total')}:{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {fmt(Object.values(byCurrency)[0] ?? 0, Object.keys(byCurrency)[0] ?? 'UAH')}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={handleViewModeChange} />
          <Button onClick={() => setShowCreate(true)}>{t('accounts.new')}</Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : sortedAccounts.length === 0 ? (
        <Empty
          text={t('accounts.empty')}
          action={() => setShowCreate(true)}
          actionLabel={t('accounts.addFirst')}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAccounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              archiveLabel={t('common.archive')}
              onArchive={() => actions.handlers.onArchive(a)}
              onEdit={() => actions.handlers.onEdit(a)}
              onNameSave={(name) => actions.handlers.onNameSave(a, name)}
              onQuickTx={(type) => actions.handlers.onQuickTx(a, type)}
              onAdjust={() => actions.handlers.onAdjust(a)}
            />
          ))}
        </div>
      ) : (
        <ul
          role="list"
          className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900"
        >
          {sortedAccounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              archiveLabel={t('common.archive')}
              onArchive={() => actions.handlers.onArchive(a)}
              onEdit={() => actions.handlers.onEdit(a)}
              onNameSave={(name) => actions.handlers.onNameSave(a, name)}
              onQuickTx={(type) => actions.handlers.onQuickTx(a, type)}
              onAdjust={() => actions.handlers.onAdjust(a)}
            />
          ))}
        </ul>
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

      {actions.modals.editAccount && (
        <EditAccountModal
          account={actions.modals.editAccount}
          hid={hid}
          onClose={actions.closeEdit}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            qc.invalidateQueries({ queryKey: ['transactions', hid] });
            actions.closeEdit();
          }}
        />
      )}

      {actions.modals.quickTx && (
        <QuickTxModal
          account={actions.modals.quickTx.account}
          txType={actions.modals.quickTx.type}
          hid={hid}
          accounts={accounts}
          categories={categories}
          onClose={actions.closeQuickTx}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            actions.closeQuickTx();
          }}
        />
      )}

      {actions.modals.adjustAccount && (
        <AdjustBalanceModal
          account={actions.modals.adjustAccount}
          hid={hid}
          onClose={actions.closeAdjust}
          onAdjusted={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            qc.invalidateQueries({ queryKey: ['transactions', hid] });
            actions.closeAdjust();
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Grid / list view toggle
// ──────────────────────────────────────────────
function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const { t } = useTranslation();
  const btn = (mode: ViewMode, glyph: string, label: string) => {
    const active = value === mode;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={() => onChange(mode)}
        className={`flex h-8 w-8 items-center justify-center text-base transition-colors ${
          active
            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
            : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
        }`}
      >
        {glyph}
      </button>
    );
  };
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      {btn('grid', '⊞', t('accounts.view.grid'))}
      {btn('list', '☰', t('accounts.view.list'))}
    </div>
  );
}

// Shared props for both grid card and list row so they don't drift (#164).
interface AccountViewProps {
  account: Account;
  archiveLabel: string;
  onArchive: () => void;
  onEdit: () => void;
  onNameSave: (name: string) => void;
  onQuickTx: (type: QuickTxType) => void;
  onAdjust: () => void;
}

// ──────────────────────────────────────────────
// Account card with inline name edit
// ──────────────────────────────────────────────
function AccountCard({ account, archiveLabel, onArchive, onEdit, onNameSave, onQuickTx, onAdjust }: AccountViewProps) {
  const { t } = useTranslation();
  const name = useInlineNameEdit(account.name, onNameSave);

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <Badge label={account.type} />
          {name.editing ? (
            <input
              {...name.inputProps}
              className="mt-2 w-full rounded border border-primary-400 bg-white px-1 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
            />
          ) : (
            <p
              className="mt-2 cursor-text truncate font-semibold text-gray-900 dark:text-gray-100"
              onDoubleClick={name.enter}
              title="Double-click to edit"
            >
              {account.name}
            </p>
          )}
        </div>
        <div className="ml-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="text-sm text-gray-400 hover:text-primary-600 dark:text-gray-500 dark:hover:text-primary-400"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={onArchive}
            className="text-sm text-gray-400 hover:text-red-400 dark:text-gray-500 dark:hover:text-red-400"
            title={archiveLabel}
          >
            🗑
          </button>
        </div>
      </div>
      <p
        className="mt-3 cursor-pointer text-2xl font-bold text-gray-800 transition-colors hover:text-primary-600 dark:text-gray-200 dark:hover:text-primary-400"
        onClick={onAdjust}
        title={t('accounts.adjustBalance')}
      >
        {fmt(Number(account.balance), account.currency)}
      </p>
      <div className="mt-0.5 flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">{account.currency}</p>
        <QuickTxDropdown onSelect={onQuickTx} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Account row (list view) — compact horizontal layout with the same
// interactions as AccountCard (#164).
// ──────────────────────────────────────────────
function AccountRow({ account, archiveLabel, onArchive, onEdit, onNameSave, onQuickTx, onAdjust }: AccountViewProps) {
  const { t } = useTranslation();
  const name = useInlineNameEdit(account.name, onNameSave);

  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <Badge label={account.type} />
      <div className="min-w-0 flex-1">
        {name.editing ? (
          <input
            {...name.inputProps}
            className="w-full max-w-xs rounded border border-primary-400 bg-white px-1 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
        ) : (
          <p
            className="cursor-text truncate font-medium text-gray-900 dark:text-gray-100"
            onDoubleClick={name.enter}
            title="Double-click to edit"
          >
            {account.name}
          </p>
        )}
      </div>
      <button
        onClick={onAdjust}
        title={t('accounts.adjustBalance')}
        className="cursor-pointer whitespace-nowrap text-right text-sm font-semibold text-gray-800 transition-colors hover:text-primary-600 dark:text-gray-200 dark:hover:text-primary-400"
      >
        {fmt(Number(account.balance), account.currency)}
      </button>
      <span className="w-10 text-right text-xs text-gray-400 dark:text-gray-500">{account.currency}</span>
      <QuickTxDropdown onSelect={onQuickTx} />
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="text-sm text-gray-400 hover:text-primary-600 dark:text-gray-500 dark:hover:text-primary-400"
          title="Edit"
        >
          ✏️
        </button>
        <button
          onClick={onArchive}
          className="text-sm text-gray-400 hover:text-red-400 dark:text-gray-500 dark:hover:text-red-400"
          title={archiveLabel}
        >
          🗑
        </button>
      </div>
    </li>
  );
}

// ──────────────────────────────────────────────
// Quick transaction dropdown button
// ──────────────────────────────────────────────
function QuickTxDropdown({ onSelect }: { onSelect: (type: QuickTxType) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options: { type: QuickTxType; label: string; color: string }[] = [
    { type: 'income',   label: `+ ${t('transactions.types.income')}`,   color: 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30' },
    { type: 'expense',  label: `− ${t('transactions.types.expense')}`,  color: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30' },
    { type: 'transfer', label: `⇄ ${t('transactions.types.transfer')}`, color: 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-600 transition-colors hover:bg-primary-200 dark:bg-primary-900/40 dark:text-primary-300 dark:hover:bg-primary-900/60"
        title={t('accounts.quickTx')}
      >
        +
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-10 mb-1 min-w-[150px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {options.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => { onSelect(type); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
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
  const [type, setType] = useState<AccountType>('bank');
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
        <Select label={t('accounts.type')} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((tp) => <option key={tp} value={tp}>{t(`accounts.types.${tp}` as never)}</option>)}
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
        <Select label={t('accounts.type')} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          {ACCOUNT_TYPES.map((tp) => <option key={tp} value={tp}>{t(`accounts.types.${tp}` as never)}</option>)}
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

// ──────────────────────────────────────────────
// Quick transaction modal (pre-filled with account)
// ──────────────────────────────────────────────
function QuickTxModal({ account, txType, hid, accounts, categories, onClose, onCreated }: {
  account: Account;
  txType: QuickTxType;
  hid: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  // Cross-currency (#162): a second amount field for the received leg.
  const [toAmount, setToAmount] = useState('');
  const [toAmountTouched, setToAmountTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState('');
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.id !== account.id)?.id ?? '',
  );
  const [saving, setSaving] = useState(false);

  const isTransfer = txType === 'transfer';
  // Only income/expense have categories; transfers don't. Ternary lets TS
  // narrow txType so the equality check compiles.
  const filteredCategories = isTransfer ? [] : categories.filter((c) => c.type === txType);
  const otherAccounts = accounts.filter((a) => a.id !== account.id);

  const toAccount = accounts.find((a) => a.id === toAccountId) ?? null;
  const fromCcy = account.currency;
  const toCcy = toAccount?.currency ?? fromCcy;
  const isCrossCurrency = isTransfer && fromCcy !== toCcy;

  // Only fetch rates when we need to convert a live amount.
  const ratesState = useRatesState(isCrossCurrency);
  const marketRate = isCrossCurrency && ratesState.status === 'ready'
    ? convert(1, fromCcy, toCcy, ratesState.rates)
    : null;

  // Auto-fill toAmount = amount * marketRate while the user hasn't typed.
  useEffect(() => {
    if (!isCrossCurrency) return;
    if (toAmountTouched) return;
    if (marketRate === null) return;
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setToAmount('');
      return;
    }
    setToAmount((parsed * marketRate).toFixed(2));
  }, [amount, marketRate, isCrossCurrency, toAmountTouched]);

  // Changing the destination account resets the derived toAmount so we
  // re-auto-fill from the new rate.
  useEffect(() => {
    setToAmountTouched(false);
    setToAmount('');
  }, [toAccountId]);

  const recalc = () => setToAmountTouched(false);

  const fromNum = parseFloat(amount);
  const toNum = parseFloat(toAmount);
  const effectiveRate = isCrossCurrency && Number.isFinite(fromNum) && Number.isFinite(toNum) && fromNum > 0
    ? toNum / fromNum
    : null;

  const titleKey = `transactions.types.${txType}` as const;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      if (isTransfer) {
        await financeApi.createTransfer(hid, isCrossCurrency
          ? {
              fromAccountId: account.id,
              toAccountId,
              fromAmount: fromNum,
              toAmount: toNum,
              currency: fromCcy,
              toCurrency: toCcy,
              description: description || undefined,
              date,
            }
          : {
              fromAccountId: account.id,
              toAccountId,
              fromAmount: fromNum,
              toAmount: fromNum,
              currency: fromCcy,
              description: description || undefined,
              date,
            });
      } else {
        await financeApi.createTransaction(hid, {
          accountId: account.id,
          type: txType,
          amount: parseFloat(amount),
          currency: account.currency,
          description: description || undefined,
          date,
          categoryId: categoryId || undefined,
        });
      }
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={`${t(titleKey as never)} — ${account.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {/* From account — read-only info */}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <span className="font-medium">{t('transactions.account')}:</span>{' '}
          {account.name}{' '}
          <span className="text-gray-400 dark:text-gray-500">({fmt(Number(account.balance), account.currency)})</span>
        </div>

        {/* Transfer: target account */}
        {isTransfer && (
          otherAccounts.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
              You need at least 2 accounts to make a transfer.
            </p>
          ) : (
            <Select
              label={t('transactions.to')}
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
            >
              {otherAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </Select>
          )
        )}

        <Input
          label={isTransfer ? `${t('transactions.transferSent')} (${fromCcy})` : t('transactions.amount')}
          type="number" step="0.01" min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
          autoFocus
        />

        {isCrossCurrency && (
          <div className="space-y-1">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={`${t('transactions.transferReceived')} (${toCcy})`}
                  type="number" step="0.01" min="0.01"
                  value={toAmount}
                  onChange={(e) => {
                    setToAmount(e.target.value);
                    setToAmountTouched(true);
                  }}
                  required
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                onClick={recalc}
                disabled={marketRate === null}
                title={t('transactions.transferRecalcTitle')}
                className="mb-[2px] flex h-[38px] w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                ↻
              </button>
            </div>
            {ratesState.status === 'ready' && marketRate !== null ? (
              <p className="pl-1 text-xs text-gray-400 dark:text-gray-500">
                {t('transactions.transferEffectiveRate', {
                  from: fromCcy,
                  rate: marketRate.toFixed(4),
                  to: toCcy,
                })}
                {effectiveRate !== null && (
                  <>
                    {' · '}
                    {t('transactions.transferYourRate', { rate: effectiveRate.toFixed(4) })}
                  </>
                )}
              </p>
            ) : ratesState.status === 'loading' ? (
              <p className="pl-1 text-xs text-gray-400 dark:text-gray-500">{t('accounts.loading')}</p>
            ) : (
              <p className="pl-1 text-xs text-amber-600 dark:text-amber-400">
                {t('transactions.transferRateUnavailable')}
              </p>
            )}
          </div>
        )}

        <Input
          label={t('transactions.date')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />

        <Input
          label={`${t('transactions.description')} (${t('common.optional')})`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {filteredCategories.length > 0 && (
          <Select
            label={`${t('transactions.category')} (${t('common.optional')})`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t('transactions.noCategory')}</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={
              saving
              || !amount
              || (isTransfer && !toAccountId)
              || (isCrossCurrency && (!toAmount || !Number.isFinite(toNum) || toNum <= 0))
            }
          >
            {saving ? t('common.saving') : t('common.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Manual balance adjustment modal
// ──────────────────────────────────────────────
function AdjustBalanceModal({ account, hid, onClose, onAdjusted }: {
  account: Account;
  hid: string;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const { t } = useTranslation();
  const currentBalance = Number(account.balance);
  const [newBalance, setNewBalance] = useState(currentBalance.toFixed(2));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseFloat(newBalance);
  const delta = Number.isFinite(parsed) ? parsed - currentBalance : 0;
  const deltaClass =
    delta > 0
      ? 'text-green-600 dark:text-green-400'
      : delta < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-400 dark:text-gray-500';
  const deltaSign = delta > 0 ? '+' : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(parsed)) {
      setError(t('accounts.adjust.invalidNumber'));
      return;
    }
    if (delta === 0) {
      setError(t('accounts.adjust.noChange'));
      return;
    }
    setSaving(true);
    try {
      await financeApi.adjustBalance(account.id, hid, {
        newBalance: parsed,
        description: description.trim() || undefined,
      });
      onAdjusted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${t('accounts.adjustBalance')} — ${account.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <span className="font-medium">{t('accounts.adjust.current')}:</span>{' '}
          <span className="text-gray-800 dark:text-gray-200">{fmt(currentBalance, account.currency)}</span>
        </div>

        <Input
          label={t('accounts.adjust.newBalance')}
          type="number"
          step="0.01"
          value={newBalance}
          onChange={(e) => setNewBalance(e.target.value)}
          required
          autoFocus
        />

        <div className="text-sm">
          <span className="text-gray-500 dark:text-gray-400">{t('accounts.adjust.delta')}:</span>{' '}
          <span className={`font-semibold ${deltaClass}`}>
            {deltaSign}{fmt(delta, account.currency)}
          </span>
        </div>

        <Input
          label={`${t('transactions.description')} (${t('common.optional')})`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('accounts.adjust.descriptionPlaceholder')}
        />

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t('accounts.adjust.hint')}
        </p>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving || delta === 0}>
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
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      <p className="mb-3">{text}</p>
      {action && actionLabel && (
        <Button variant="secondary" size="sm" onClick={action}>{actionLabel}</Button>
      )}
    </div>
  );
}
