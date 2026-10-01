import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { CreateTransferInput } from '../../../src/api/finance';
import { Chips } from '../../../src/components/Chips';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import {
  TransactionForm,
  toCreateInput,
} from '../../../src/components/TransactionForm';
import type { TransactionFormValues } from '../../../src/components/TransactionForm';
import { TransferForm } from '../../../src/components/TransferForm';
import { useAccounts } from '../../../src/hooks/useAccounts';
import {
  useCategories,
  useTransactionMutations,
} from '../../../src/hooks/useTransactions';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';

export default function NewTransactionScreen() {
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const accounts = useAccounts(hid);
  const categories = useCategories(hid);
  const { create, transfer } = useTransactionMutations(hid);
  const [mode, setMode] = useState<'entry' | 'transfer'>('entry');
  const [error, setError] = useState('');

  const list = accounts.data ?? [];
  if (!accounts.data) {
    return (
      <Screen>
        <Notice
          title={accounts.isError ? "Couldn't load accounts" : 'Loading…'}
        />
      </Screen>
    );
  }
  if (list.length === 0) {
    return (
      <Screen>
        <Notice
          title="No accounts yet"
          body="Add an account before recording transactions."
        />
      </Screen>
    );
  }

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      router.back();
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  const submitEntry = (v: TransactionFormValues) =>
    run(() => {
      const currency =
        list.find((a) => a.id === v.accountId)?.currency ?? 'UAH';
      return create.mutateAsync(toCreateInput(v, currency));
    });

  const submitTransfer = (p: CreateTransferInput) =>
    run(() => transfer.mutateAsync(p));

  return (
    <Screen>
      <Chips
        label="Kind"
        options={[
          { value: 'entry', label: 'Income / expense' },
          { value: 'transfer', label: 'Transfer' },
        ]}
        value={mode}
        onChange={(v) => {
          setError('');
          setMode(v as 'entry' | 'transfer');
        }}
      />
      {mode === 'entry' ? (
        <TransactionForm
          accounts={list}
          categories={categories.data ?? []}
          submitLabel="Add transaction"
          error={error}
          busy={create.isPending}
          onSubmit={submitEntry}
        />
      ) : (
        <TransferForm
          accounts={list}
          error={error}
          busy={transfer.isPending}
          onSubmit={submitTransfer}
        />
      )}
    </Screen>
  );
}
