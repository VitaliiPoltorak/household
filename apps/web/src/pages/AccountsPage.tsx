import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import type { Account, Category } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

type QuickTxType = 'income' | 'expense' | 'transfer';

const ACCOUNT_TYPES = ['cash', 'bank', 'crypto', 'investment', 'deposit'] as const;
const CURRENCIES = ['UAH', 'USD', 'EUR'];
const BASE_CURRENCY_KEY = 'accounts:baseCurrency';
const RATES_CACHE_KEY = 'accounts:ratesCache';
// Cache stays usable for a week — beyond that we prefer "unavailable" to
// showing week-old totals. Rates rarely move enough that day-old cache is
// harmful, but a month-old cache is misleading.
const RATES_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
// PrivatBank always returns rates vs UAH (base_ccy === 'UAH'). If they ever
// change that, this hook needs revisiting.
interface PBRate { ccy: string; base_ccy: string; buy: string; sale: string }

type RateMap = Record<string, number>;

// Discrete state so the render side never has to guess whether a missing rate
// means "we didn't need one" (all accounts in base) or "rates broke and the
// total is bogus". The old ?? 1 fallback conflated these — a $100 balance
// showed as ₴100 when PrivatBank was down.
export type RatesState =
  | { status: 'not-needed' }
  | { status: 'loading' }
  | { status: 'ready'; rates: RateMap; source: 'live' | 'cache'; at: Date }
  | { status: 'failed' };

interface CachedRates {
  rates: RateMap;
  at: number;
}

function readRatesCache(): CachedRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (!parsed?.rates || !parsed.at) return null;
    if (Date.now() - parsed.at > RATES_CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRatesCache(rates: RateMap): void {
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates, at: Date.now() }));
  } catch {
    // localStorage full / disabled — cache is best-effort, don't crash render.
  }
}

function ratesFromPB(pb: PBRate[]): RateMap {
  const rates: RateMap = { UAH: 1 };
  for (const r of pb) {
    const n = parseFloat(r.buy);
    if (Number.isFinite(n) && n > 0) rates[r.ccy] = n;
  }
  return rates;
}

export function useRatesState(needed: boolean): RatesState {
  const { data: pbRates, isLoading, isError, isFetched } = useQuery<PBRate[]>({
    queryKey: ['privatbank-rates'],
    queryFn: async () => {
      const res = await fetch(
        'https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5',
      );
      if (!res.ok) throw new Error('PrivatBank API error');
      return res.json() as Promise<PBRate[]>;
    },
    enabled: needed,
    staleTime: 30 * 60 * 1000, // 30 min
    retry: 1,
  });

  // Persist last-known-good so a brief outage doesn't blank the total.
  useEffect(() => {
    if (pbRates && pbRates.length > 0) {
      writeRatesCache(ratesFromPB(pbRates));
    }
  }, [pbRates]);

  if (!needed) return { status: 'not-needed' };

  if (pbRates && pbRates.length > 0) {
    return { status: 'ready', rates: ratesFromPB(pbRates), source: 'live', at: new Date() };
  }

  // No live data yet. Two sub-cases:
  //   1. Still loading → 'loading'
  //   2. Fetched but empty / error → fall back to cache, else 'failed'
  if (isLoading && !isFetched) return { status: 'loading' };

  if (isError || (isFetched && (!pbRates || pbRates.length === 0))) {
    const cached = readRatesCache();
    if (cached) {
      return { status: 'ready', rates: cached.rates, source: 'cache', at: new Date(cached.at) };
    }
    return { status: 'failed' };
  }

  return { status: 'loading' };
}

// Convert amount in fromCcy to toCcy using UAH-based rate map. Returns null
// if any required currency is missing — caller MUST check and refuse to show
// a total in that case, rather than falling back to a silent 1:1 substitution.
export function convert(amount: number, fromCcy: string, toCcy: string, rates: RateMap): number | null {
  if (fromCcy === toCcy) return amount;
  const fromRate = fromCcy === 'UAH' ? 1 : rates[fromCcy];
  const toRate = toCcy === 'UAH' ? 1 : rates[toCcy];
  if (!fromRate || !toRate) return null;
  const fromUAH = amount * fromRate;
  return fromUAH / toRate;
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
  const [quickTx, setQuickTx] = useState<{ account: Account; type: QuickTxType } | null>(null);
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string>(
    () => localStorage.getItem(BASE_CURRENCY_KEY) ?? 'UAH',
  );

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

  // Sort A-Z client-side — prevents visual jumps after revalidation
  const sortedAccounts = [...accounts].sort((a, b) => a.name.localeCompare(b.name));

  const ratesNeeded = sortedAccounts.some(a => a.currency !== baseCurrency);
  const ratesState = useRatesState(ratesNeeded);

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
              {ratesState.status === 'ready' && grandTotal !== null ? (
                <>
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
                      {ratesState.source === 'cache' && (
                        <span className="ml-1 text-amber-500">({t('accounts.rates.cached')})</span>
                      )}
                    </span>
                  )}
                </>
              ) : ratesState.status === 'loading' ? (
                <span className="text-xs text-gray-400">{t('accounts.loading')}</span>
              ) : (
                <span
                  className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-0.5"
                  title={t('accounts.rates.unavailableDesc')}
                >
                  {t('accounts.rates.unavailable')}
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
      ) : sortedAccounts.length === 0 ? (
        <Empty
          text={t('accounts.empty')}
          action={() => setShowCreate(true)}
          actionLabel={t('accounts.addFirst')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAccounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              archiveLabel={t('common.archive')}
              onArchive={() => archive.mutate(a.id)}
              onEdit={() => setEditAccount(a)}
              onNameSave={(name) => updateAccount.mutate({ id: a.id, data: { name } })}
              onQuickTx={(type) => setQuickTx({ account: a, type })}
              onAdjust={() => setAdjustAccount(a)}
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

      {quickTx && (
        <QuickTxModal
          account={quickTx.account}
          txType={quickTx.type}
          hid={hid}
          accounts={accounts}
          categories={categories}
          onClose={() => setQuickTx(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            setQuickTx(null);
          }}
        />
      )}

      {adjustAccount && (
        <AdjustBalanceModal
          account={adjustAccount}
          hid={hid}
          onClose={() => setAdjustAccount(null)}
          onAdjusted={() => {
            qc.invalidateQueries({ queryKey: ['accounts', hid] });
            qc.invalidateQueries({ queryKey: ['transactions', hid] });
            setAdjustAccount(null);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Account card with inline name edit
// ──────────────────────────────────────────────
function AccountCard({ account, archiveLabel, onArchive, onEdit, onNameSave, onQuickTx, onAdjust }: {
  account: Account;
  archiveLabel: string;
  onArchive: () => void;
  onEdit: () => void;
  onNameSave: (name: string) => void;
  onQuickTx: (type: QuickTxType) => void;
  onAdjust: () => void;
}) {
  const { t } = useTranslation();
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
      <p
        className="mt-3 text-2xl font-bold text-gray-800 cursor-pointer hover:text-primary-600 transition-colors"
        onClick={onAdjust}
        title={t('accounts.adjustBalance')}
      >
        {fmt(Number(account.balance), account.currency)}
      </p>
      <div className="flex items-center justify-between mt-0.5">
        <p className="text-xs text-gray-400">{account.currency}</p>
        <QuickTxDropdown onSelect={onQuickTx} />
      </div>
    </div>
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
    { type: 'income',   label: `+ ${t('transactions.types.income')}`,   color: 'text-green-600 hover:bg-green-50' },
    { type: 'expense',  label: `− ${t('transactions.types.expense')}`,  color: 'text-red-600 hover:bg-red-50' },
    { type: 'transfer', label: `⇄ ${t('transactions.types.transfer')}`, color: 'text-blue-600 hover:bg-blue-50' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-600 text-lg font-bold hover:bg-primary-200 transition-colors"
        title={t('accounts.quickTx')}
      >
        +
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 min-w-[150px] rounded-xl border border-gray-200 bg-white shadow-lg z-10 overflow-hidden">
          {options.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => { onSelect(type); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm font-medium ${color} transition-colors`}
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
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState('');
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.id !== account.id)?.id ?? '',
  );
  const [saving, setSaving] = useState(false);

  const isTransfer = txType === 'transfer';
  const filteredCategories = categories.filter((c) => c.type === txType && txType !== 'transfer');
  const otherAccounts = accounts.filter((a) => a.id !== account.id);

  const titleKey = `transactions.types.${txType}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      if (isTransfer) {
        await financeApi.createTransfer(hid, {
          fromAccountId: account.id,
          toAccountId,
          amount: parseFloat(amount),
          currency: account.currency,
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
    <Modal title={`${t(titleKey)} — ${account.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {/* From account — read-only info */}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
          <span className="font-medium">{t('transactions.account')}:</span>{' '}
          {account.name}{' '}
          <span className="text-gray-400">({fmt(Number(account.balance), account.currency)})</span>
        </div>

        {/* Transfer: target account */}
        {isTransfer && (
          otherAccounts.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
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
          label={t('transactions.amount')}
          type="number" step="0.01" min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
          autoFocus
        />

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
            disabled={saving || !amount || (isTransfer && !toAccountId)}
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
  const deltaClass = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400';
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
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
          <span className="font-medium">{t('accounts.adjust.current')}:</span>{' '}
          <span className="text-gray-800">{fmt(currentBalance, account.currency)}</span>
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
          <span className="text-gray-500">{t('accounts.adjust.delta')}:</span>{' '}
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
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <p className="text-xs text-gray-400">
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
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="mb-3">{text}</p>
      {action && actionLabel && (
        <Button variant="secondary" size="sm" onClick={action}>{actionLabel}</Button>
      )}
    </div>
  );
}
