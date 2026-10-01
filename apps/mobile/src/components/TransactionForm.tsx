import { useState } from 'react';
import type { Account, Category, Transaction } from '../api/types';
import type { CreateTransactionInput } from '../api/finance';
import { isIsoDate, todayIso } from '../lib/dates';
import { parseAmount } from '../lib/transfer';
import { Chips } from './Chips';
import { DateField } from './DateField';
import { ErrorText } from './ErrorText';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

export interface TransactionFormValues {
  type: 'income' | 'expense' | 'adjustment';
  accountId: string;
  amount: number;
  categoryId?: string;
  description?: string;
  date: string;
}

/** Category label with its parent, so "Groceries" sub-categories stay distinguishable. */
export function categoryLabel(c: Category, all: Category[]): string {
  const parent = c.parentId ? all.find((p) => p.id === c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

/**
 * Income / expense form, used for create and (with `tx`) edit. On edit the
 * account is fixed (the API can't move a transaction) and `adjustment` rows
 * keep their type; a transfer leg never reaches this form (see TransferLegForm).
 */
export function TransactionForm({
  tx,
  accounts,
  categories,
  submitLabel,
  error,
  busy,
  onSubmit,
}: {
  tx?: Transaction;
  accounts: Account[];
  categories: Category[];
  submitLabel: string;
  error: string;
  busy: boolean;
  onSubmit: (v: TransactionFormValues) => void;
}) {
  const editing = !!tx;
  const [type, setType] = useState<TransactionFormValues['type']>(
    (tx?.type as TransactionFormValues['type']) ?? 'expense',
  );
  const [accountId, setAccountId] = useState(
    tx?.accountId ?? accounts[0]?.id ?? '',
  );
  // Adjustments store a signed delta, so the sign must survive the round trip.
  const [amount, setAmount] = useState(tx ? String(Number(tx.amount)) : '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [date, setDate] = useState(tx?.date?.slice(0, 10) ?? todayIso());
  const [localError, setLocalError] = useState('');

  const account = accounts.find((a) => a.id === accountId);
  const catOptions = categories
    .filter((c) => c.type === type && !c.isArchived)
    .map((c) => ({ value: c.id, label: categoryLabel(c, categories) }));

  const submit = () => {
    const n = parseAmount(amount);
    if (!Number.isFinite(n) || n === 0 || (type !== 'adjustment' && n < 0)) {
      setLocalError(
        type === 'adjustment'
          ? 'Enter a non-zero amount.'
          : 'Enter an amount greater than zero.',
      );
      return;
    }
    if (!isIsoDate(date)) {
      setLocalError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    if (!accountId) {
      setLocalError('Pick an account.');
      return;
    }
    setLocalError('');
    onSubmit({
      type,
      accountId,
      amount: n,
      // A category only fits income/expense and must match the chosen type.
      categoryId:
        type !== 'adjustment' && catOptions.some((o) => o.value === categoryId)
          ? categoryId
          : undefined,
      description: description.trim() || undefined,
      date,
    });
  };

  const typeOptions = editing
    ? [
        { value: 'income', label: 'Income' },
        { value: 'expense', label: 'Expense' },
        { value: 'adjustment', label: 'Adjustment' },
      ]
    : [
        { value: 'expense', label: 'Expense' },
        { value: 'income', label: 'Income' },
      ];

  return (
    <>
      <ErrorText message={localError || error} />
      <Chips
        label="Type"
        options={typeOptions}
        value={type}
        onChange={(v) => setType(v as TransactionFormValues['type'])}
      />
      {editing ? null : (
        <Chips
          label="Account"
          options={accounts.map((a) => ({
            value: a.id,
            label: `${a.name} (${a.currency})`,
          }))}
          value={accountId}
          onChange={setAccountId}
        />
      )}
      <TextField
        label={`Amount${account ? ` (${tx?.currency ?? account.currency})` : ''}`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numbers-and-punctuation"
        placeholder="0.00"
      />
      {type !== 'adjustment' && catOptions.length > 0 ? (
        <Chips
          label="Category (optional)"
          options={[{ value: '', label: 'None' }, ...catOptions]}
          value={categoryId}
          onChange={setCategoryId}
        />
      ) : null}
      <DateField value={date} onChangeText={setDate} />
      <TextField
        label="Note (optional)"
        value={description}
        onChangeText={setDescription}
        autoCapitalize="sentences"
      />
      <PrimaryButton label={submitLabel} onPress={submit} loading={busy} />
    </>
  );
}

/** Shape helper so callers don't hand-build the create payload. */
export function toCreateInput(
  v: TransactionFormValues,
  currency: string,
): CreateTransactionInput {
  return {
    accountId: v.accountId,
    type: v.type as 'income' | 'expense',
    amount: v.amount,
    currency,
    ...(v.categoryId ? { categoryId: v.categoryId } : {}),
    ...(v.description ? { description: v.description } : {}),
    date: v.date,
  };
}
