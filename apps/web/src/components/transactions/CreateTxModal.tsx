import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { financeApi } from '../../api/finance';
import { asInsufficientFunds } from '../../lib/finance-errors';
import type { Account, Category, TransactionType } from '../../types/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';

const TX_TYPES: readonly Exclude<TransactionType, 'transfer'>[] = ['income', 'expense', 'adjustment'] as const;

function today(): string {
  return new Date().toISOString().split('T')[0];
}

interface Props {
  hid: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}

/** New-transaction modal. Type is required (no default) so the user picks explicitly. */
export function CreateTxModal({ hid, accounts, categories, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [type, setType] = useState<'' | Exclude<TransactionType, 'transfer'>>('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  // Rendered against the amount field, which is where the mistake was made.
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = categories.filter((c) => c.type === type);
  const canSubmit = !!type && !!amount && parseFloat(amount) > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !type) return;
    setSaving(true);
    setAmountError(null);
    setError(null);
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
    } catch (err) {
      // The withdrawal guard (#326) is the one failure the user can act on
      // directly, so it lands on the amount field with the balance spelled
      // out. Everything else keeps the generic banner — previously this
      // handler had no catch at all and a failed create looked like a no-op.
      const funds = asInsufficientFunds(err);
      if (funds) {
        setAmountError(
          t('transactions.insufficientFunds', {
            available: funds.available,
            currency: funds.currency,
          }),
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('transactions.newTitle')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select
          label={t('transactions.type')}
          value={type}
          onChange={(e) => {
            setType(e.target.value as Exclude<TransactionType, 'transfer'> | '');
            setCategoryId('');
          }}
          required
        >
          <option value="" disabled>{t('transactions.selectType')}</option>
          {TX_TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(`transactions.types.${tp}` as never)}</option>
          ))}
        </Select>

        <Select label={t('transactions.account')} value={accountId}
          onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </Select>

        <Input label={t('transactions.amount')} type="number" step="0.01" min="0.01"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setAmountError(null); }}
          error={amountError ?? undefined}
          required placeholder="0.00" />

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

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
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
