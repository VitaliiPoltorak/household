import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { financeApi } from '../../api/finance';
import type { Category, Transaction, TransactionType } from '../../types/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';

const TX_TYPES: readonly Exclude<TransactionType, 'transfer'>[] = ['income', 'expense', 'adjustment'] as const;

interface Props {
  tx: Transaction;
  hid: string;
  categories: Category[];
  accountName: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit an existing transaction. Type + amount are locked for transfer legs. */
export function EditTxModal({ tx, hid, categories, accountName, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const isTransfer = tx.type === 'transfer';

  const [type, setType] = useState<TransactionType>(tx.type);
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description ?? '');
  const [date, setDate] = useState(tx.date);
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? '');
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await financeApi.updateTransaction(tx.id, hid, {
        ...(isTransfer
          ? {}
          : { type: type as 'income' | 'expense' | 'adjustment', amount: parseFloat(amount) }),
        description: description || undefined,
        date,
        categoryId: categoryId || undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('transactions.editTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <span className="font-medium">{t('transactions.account')}:</span>{' '}{accountName}
        </div>

        {isTransfer && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
            ⚠️ Transfer type and amount cannot be changed — both sides of the transfer must stay in sync.
          </p>
        )}

        <Select
          label={t('transactions.type')}
          value={type}
          onChange={(e) => {
            setType(e.target.value as TransactionType);
            setCategoryId('');
          }}
          disabled={isTransfer}
        >
          {TX_TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(`transactions.types.${tp}` as never)}</option>
          ))}
        </Select>

        <Input
          label={t('transactions.amount')}
          type="number" step="0.01" min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isTransfer}
          required
        />

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
