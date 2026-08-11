import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { financeApi } from '../api/finance';
import type { Transaction } from '../types/api';
import { Button } from '../components/ui/Button';
import { TxRow } from '../components/transactions/TxRow';
import { TxFilters } from '../components/transactions/TxFilters';
import { CreateTxModal } from '../components/transactions/CreateTxModal';
import { EditTxModal } from '../components/transactions/EditTxModal';
import { TransferModal } from '../components/transactions/TransferModal';
import { useTransactions } from '../hooks/useTransactions';
import { useTransactionFilters } from '../hooks/useTransactionFilters';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';

export function TransactionsPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';

  const { filters, hasFilters, setType, setAccountId, setFrom, setTo, clear } = useTransactionFilters();
  const { data: transactions = [], isLoading } = useTransactions(hid, filters);
  const { data: accounts = [] } = useAccounts(hid);
  const { data: categories = [] } = useCategories(hid);

  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

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

  if (!activeHousehold) return <p className="text-gray-500 dark:text-gray-400">{t('common.selectHousehold')}</p>;

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['transactions', hid] });
    qc.invalidateQueries({ queryKey: ['accounts', hid] });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('transactions.title')}</h1>
        <Button variant="secondary" size="sm" onClick={() => setShowTransfer(true)}>
          {t('transactions.transfer')}
        </Button>
        <Button size="sm" onClick={() => setShowCreate(true)}>{t('transactions.new')}</Button>
      </div>

      <TxFilters
        accounts={accounts}
        filterType={filters.type}
        filterAccountId={filters.accountId}
        from={filters.from}
        to={filters.to}
        hasFilters={hasFilters}
        onTypeChange={setType}
        onAccountChange={setAccountId}
        onFromChange={setFrom}
        onToChange={setTo}
        onClear={clear}
      />

      {isLoading ? (
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      ) : transactions.length === 0 ? (
        <div className="py-16 text-center text-gray-400 dark:text-gray-500">{t('transactions.empty')}</div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
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
