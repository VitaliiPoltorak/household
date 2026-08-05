import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import type { Transaction, Account, Category } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EditingBadge } from '../components/presence/EditingBadge';

const TX_TYPES = ['income', 'expense', 'adjustment'] as const;

function fmt(n: number, currency = 'UAH') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

function today() { return new Date().toISOString().split('T')[0]; }

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export function TransactionsPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const [filterType, setFilterType] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', hid, filterType, filterAccountId, from, to],
    queryFn: () => financeApi.getTransactions(hid, {
      type: filterType || undefined,
      accountId: filterAccountId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    enabled: !!hid,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', hid],
    queryFn: () => financeApi.getAccounts(hid),
    enabled: !!hid,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', hid],
    queryFn: () => financeApi.getCategories(hid),
    enabled: !!hid,
  });

  const remove = useMutation({
    mutationFn: (id: string) => financeApi.deleteTransaction(id, hid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', hid] });
      qc.invalidateQueries({ queryKey: ['accounts', hid] });
    },
  });

  const updateTx = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      financeApi.updateTransaction(id, hid, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions', hid] }),
  });

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  if (!activeHousehold) return <p className="text-gray-500">{t('common.selectHousehold')}</p>;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['transactions', hid] });
    qc.invalidateQueries({ queryKey: ['accounts', hid] });
  };

  const hasFilters = filterType || filterAccountId || from || to;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex-1">{t('transactions.title')}</h1>
        <Button variant="secondary" size="sm" onClick={() => setShowTransfer(true)}>
          {t('transactions.transfer')}
        </Button>
        <Button size="sm" onClick={() => setShowCreate(true)}>{t('transactions.new')}</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
          <option value="">{t('transactions.allTypes')}</option>
          {['income', 'expense', 'transfer', 'adjustment'].map((tp) => (
            <option key={tp} value={tp}>{t(`transactions.types.${tp}`)}</option>
          ))}
        </select>
        <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
          <option value="">{t('transactions.allAccounts')}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          title={t('transactions.fromDate')} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          title={t('transactions.toDate')} />
        {hasFilters && (
          <button
            onClick={() => { setFilterType(''); setFilterAccountId(''); setFrom(''); setTo(''); }}
            className="text-sm text-gray-400 hover:text-gray-700"
          >
            {t('transactions.clearFilters')}
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      ) : transactions.length === 0 ? (
        <div className="py-16 text-center text-gray-400">{t('transactions.empty')}</div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {transactions.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              accountName={accountMap[tx.accountId]?.name ?? tx.accountId}
              categoryName={tx.categoryId ? (categoryMap[tx.categoryId]?.name ?? null) : null}
              onDelete={() => remove.mutate(tx.id)}
              onEdit={() => setEditTx(tx)}
              onDescriptionSave={(desc) =>
                updateTx.mutate({ id: tx.id, data: { description: desc || undefined } })
              }
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateTxModal
          hid={hid} accounts={accounts} categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={() => { invalidateAll(); setShowCreate(false); }}
        />
      )}
      {showTransfer && (
        <TransferModal
          hid={hid} accounts={accounts}
          onClose={() => setShowTransfer(false)}
          onCreated={() => { invalidateAll(); setShowTransfer(false); }}
        />
      )}
      {editTx && (
        <EditTxModal
          tx={editTx} hid={hid} categories={categories}
          accountName={accountMap[editTx.accountId]?.name ?? editTx.accountId}
          onClose={() => setEditTx(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['transactions', hid] }); setEditTx(null); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Transaction row with inline description edit
// ──────────────────────────────────────────────
function TxRow({ tx, accountName, categoryName, onDelete, onEdit, onDescriptionSave }: {
  tx: Transaction;
  accountName: string;
  categoryName: string | null;
  onDelete: () => void;
  onEdit: () => void;
  onDescriptionSave: (desc: string) => void;
}) {
  const isIncome = tx.type === 'income';
  const isExpense = tx.type === 'expense';
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(tx.description ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingDesc) inputRef.current?.select(); }, [editingDesc]);

  const saveDesc = () => {
    if (descVal !== (tx.description ?? '')) onDescriptionSave(descVal);
    setEditingDesc(false);
  };

  const cancelDesc = () => {
    setDescVal(tx.description ?? '');
    setEditingDesc(false);
  };

  return (
    <div className="flex items-center gap-4 px-5 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={tx.type} />
          {editingDesc ? (
            <input
              ref={inputRef}
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={(e) => { if (e.key === 'Enter') saveDesc(); if (e.key === 'Escape') cancelDesc(); }}
              className="flex-1 rounded border border-primary-400 px-1 text-sm text-gray-700 focus:outline-none"
            />
          ) : (
            <span
              className="text-sm text-gray-700 truncate cursor-text"
              onDoubleClick={() => setEditingDesc(true)}
              title="Double-click to edit description"
            >
              {tx.description ?? accountName}
            </span>
          )}
          {categoryName && <span className="text-xs text-gray-400">· {categoryName}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{tx.date} · {accountName}</p>
        <EditingBadge entity="transaction" entityId={tx.id} />
      </div>

      <span className={`font-semibold whitespace-nowrap ${isIncome ? 'text-green-600' : isExpense ? 'text-red-600' : 'text-gray-700'}`}>
        {isExpense ? '−' : isIncome ? '+' : ''}{fmt(Number(tx.amount), tx.currency)}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="text-gray-300 hover:text-primary-500 text-sm" title="Edit">✏️</button>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-sm" title="Delete">✕</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Create transaction modal — type required, no default
// ──────────────────────────────────────────────
function CreateTxModal({ hid, accounts, categories, onClose, onCreated }: {
  hid: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState('');           // empty = no default, required
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter(
    (c) => c.type === type,
  );

  const canSubmit = !!type && !!amount && parseFloat(amount) > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await financeApi.createTransaction(hid, {
        accountId,
        type,
        amount: parseFloat(amount),
        currency: accounts.find((a) => a.id === accountId)?.currency ?? 'UAH',
        description: description || undefined,
        date,
        categoryId: categoryId || undefined,
      });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('transactions.newTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select
          label={t('transactions.type')}
          value={type}
          onChange={(e) => { setType(e.target.value); setCategoryId(''); }}
          required
        >
          <option value="" disabled>{t('transactions.selectType')}</option>
          {TX_TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(`transactions.types.${tp}`)}</option>
          ))}
        </Select>

        <Select label={t('transactions.account')} value={accountId}
          onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </Select>

        <Input label={t('transactions.amount')} type="number" step="0.01" min="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />

        <Input label={t('transactions.date')} type="date" value={date}
          onChange={(e) => setDate(e.target.value)} required />

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
          <Button type="submit" className="flex-1" disabled={saving || !canSubmit}>
            {saving ? t('common.saving') : t('common.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Edit transaction modal — only metadata fields
// ──────────────────────────────────────────────
function EditTxModal({ tx, hid, categories, accountName, onClose, onSaved }: {
  tx: Transaction;
  hid: string;
  categories: Category[];
  accountName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [description, setDescription] = useState(tx.description ?? '');
  const [date, setDate] = useState(tx.date);
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? '');
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter(
    (c) => c.type === tx.type,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await financeApi.updateTransaction(tx.id, hid, {
        description: description || undefined,
        date,
        categoryId: categoryId || undefined,
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('transactions.editTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {/* Read-only info */}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 space-y-0.5">
          <p><span className="font-medium">{t('transactions.type')}:</span>{' '}
            {t(`transactions.types.${tx.type}`)}</p>
          <p><span className="font-medium">{t('transactions.account')}:</span>{' '}{accountName}</p>
          <p><span className="font-medium">{t('transactions.amount')}:</span>{' '}
            {fmt(Number(tx.amount), tx.currency)}</p>
        </div>

        {/* Editable fields */}
        <Input label={t('transactions.date')} type="date" value={date}
          onChange={(e) => setDate(e.target.value)} required />

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
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Transfer modal
// ──────────────────────────────────────────────
function TransferModal({ hid, accounts, onClose, onCreated }: {
  hid: string;
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await financeApi.createTransfer(hid, {
        fromAccountId: fromId,
        toAccountId: toId,
        amount: parseFloat(amount),
        currency: accounts.find((a) => a.id === fromId)?.currency ?? 'UAH',
        date,
      });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t('transactions.transferTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label={t('transactions.from')} value={fromId}
          onChange={(e) => setFromId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select label={t('transactions.to')} value={toId}
          onChange={(e) => setToId(e.target.value)}>
          {accounts.filter((a) => a.id !== fromId).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Input label={t('transactions.amount')} type="number" step="0.01" min="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        <Input label={t('transactions.date')} type="date" value={date}
          onChange={(e) => setDate(e.target.value)} required />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1"
            disabled={saving || !amount || fromId === toId}>
            {saving ? t('transactions.transferring') : t('transactions.transfer')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
