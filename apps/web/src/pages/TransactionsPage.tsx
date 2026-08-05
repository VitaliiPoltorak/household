import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { useAuth } from '../contexts/AuthContext';
import { financeApi } from '../api/finance';
import type { Transaction, Account, Category } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

const TX_TYPES = ['income', 'expense', 'transfer', 'adjustment'] as const;

function fmt(n: number, currency = 'UAH') {
  return new Intl.NumberFormat('uk-UA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

function today() { return new Date().toISOString().split('T')[0]; }

export function TransactionsPage() {
  const { activeHousehold } = useHousehold();
  
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const [filterType, setFilterType] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', hid, filterType, filterAccountId, from, to],
    queryFn: () =>
      financeApi.getTransactions(hid, {
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

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  if (!activeHousehold) return <p className="text-gray-500">Select or create a household first.</p>;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['transactions', hid] });
    qc.invalidateQueries({ queryKey: ['accounts', hid] });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Transactions</h1>
        <Button variant="secondary" size="sm" onClick={() => setShowTransfer(true)}>⇄ Transfer</Button>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ New</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterAccountId}
          onChange={(e) => setFilterAccountId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" title="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" title="To date" />
        {(filterType || filterAccountId || from || to) && (
          <button onClick={() => { setFilterType(''); setFilterAccountId(''); setFrom(''); setTo(''); }}
            className="text-sm text-gray-400 hover:text-gray-700">Clear</button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      ) : transactions.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No transactions found.</div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {transactions.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              accountName={accountMap[tx.accountId]?.name ?? tx.accountId}
              categoryName={tx.categoryId ? (categoryMap[tx.categoryId]?.name ?? null) : null}
              onDelete={() => remove.mutate(tx.id)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTxModal
          hid={hid}
          accounts={accounts}
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={() => { invalidateAll(); setShowCreate(false); }}
        />
      )}

      {showTransfer && (
        <TransferModal
          hid={hid}
          accounts={accounts}
          onClose={() => setShowTransfer(false)}
          onCreated={() => { invalidateAll(); setShowTransfer(false); }}
        />
      )}
    </div>
  );
}

function TxRow({
  tx, accountName, categoryName, onDelete,
}: {
  tx: Transaction;
  accountName: string;
  categoryName: string | null;
  onDelete: () => void;
}) {
  const isIncome = tx.type === 'income';
  const isExpense = tx.type === 'expense';

  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={tx.type} />
          <span className="text-sm text-gray-700 truncate">{tx.description ?? accountName}</span>
          {categoryName && <span className="text-xs text-gray-400">· {categoryName}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{tx.date} · {accountName}</p>
      </div>
      <span className={`font-semibold whitespace-nowrap ${isIncome ? 'text-green-600' : isExpense ? 'text-red-600' : 'text-gray-700'}`}>
        {isExpense ? '−' : isIncome ? '+' : ''}{fmt(Number(tx.amount), tx.currency)}
      </span>
      <button onClick={onDelete} className="text-gray-300 hover:text-red-400 text-sm shrink-0" title="Delete">✕</button>
    </div>
  );
}

function CreateTxModal({
  hid, accounts, categories, onClose, onCreated,
}: {
  hid: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [type, setType] = useState<'income' | 'expense' | 'adjustment'>('expense');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        createdBy: user?.id,
      });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <Modal title="New transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="adjustment">Adjustment</option>
        </Select>
        <Select label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
        </Select>
        <Input label="Amount" type="number" step="0.01" min="0.01" value={amount}
          onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        {filteredCategories.length > 0 && (
          <Select label="Category (optional)" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— none —</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving || !amount}>{saving ? 'Saving…' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({
  hid, accounts, onClose, onCreated,
}: {
  hid: string;
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}) {
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
    <Modal title="Transfer between accounts" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="From" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select label="To" value={toId} onChange={(e) => setToId(e.target.value)}>
          {accounts.filter((a) => a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Input label="Amount" type="number" step="0.01" min="0.01" value={amount}
          onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving || !amount || fromId === toId}>
            {saving ? 'Transferring…' : 'Transfer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
