import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { DateField } from '../../../src/components/DateField';
import { ErrorText } from '../../../src/components/ErrorText';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import { TransactionForm } from '../../../src/components/TransactionForm';
import type { TransactionFormValues } from '../../../src/components/TransactionForm';
import { useAccounts } from '../../../src/hooks/useAccounts';
import {
  useCategories,
  useTransaction,
  useTransactionMutations,
} from '../../../src/hooks/useTransactions';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { isIsoDate } from '../../../src/lib/dates';
import { financeErrorMessage } from '../../../src/lib/finance-errors';
import { formatMoney } from '../../../src/lib/money';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const txQuery = useTransaction(hid, id);
  const accounts = useAccounts(hid);
  const categories = useCategories(hid);
  const { update, remove } = useTransactionMutations(hid);
  const [error, setError] = useState('');
  // Transfer legs only: description + date are editable, amounts are not.
  const [legNote, setLegNote] = useState<string | null>(null);
  const [legDate, setLegDate] = useState<string | null>(null);

  const tx = txQuery.data;
  if (!tx) {
    return (
      <Screen>
        <Notice
          title={txQuery.isError ? 'Transaction not found' : 'Loading…'}
        />
      </Screen>
    );
  }
  const isTransfer = tx.type === 'transfer';

  const finish = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      router.back();
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  const save = (v: TransactionFormValues) =>
    finish(() =>
      update.mutateAsync({
        id: tx.id,
        data: {
          type: v.type,
          amount: v.amount,
          categoryId: v.categoryId,
          description: v.description,
          date: v.date,
        },
      }),
    );

  const saveLeg = () => {
    const date = legDate ?? tx.date.slice(0, 10);
    if (!isIsoDate(date)) {
      setError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    return finish(() =>
      update.mutateAsync({
        id: tx.id,
        data: { date, description: (legNote ?? tx.description ?? '').trim() },
      }),
    );
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete transaction?',
      isTransfer
        ? 'Both sides of the transfer will be removed and both balances restored.'
        : 'The account balance will be restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => finish(() => remove.mutateAsync(tx.id)),
        },
      ],
    );

  return (
    <Screen>
      {isTransfer ? (
        <>
          <ErrorText message={error} />
          <Text style={{ fontSize: 16 }}>
            Transfer · {formatMoney(Number(tx.amount), tx.currency)}
          </Text>
          <Text style={{ fontSize: 13, color: '#666' }}>
            Amounts can't be edited. Delete the transfer and re-create it to
            change them.
          </Text>
          <DateField
            value={legDate ?? tx.date.slice(0, 10)}
            onChangeText={setLegDate}
          />
          <TextField
            label="Note"
            value={legNote ?? tx.description ?? ''}
            onChangeText={setLegNote}
            autoCapitalize="sentences"
          />
          <PrimaryButton
            label="Save"
            onPress={saveLeg}
            loading={update.isPending}
          />
        </>
      ) : (
        <TransactionForm
          key={tx.id}
          tx={tx}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          submitLabel="Save"
          error={error}
          busy={update.isPending}
          onSubmit={save}
        />
      )}
      <PrimaryButton
        label="Delete transaction"
        variant="secondary"
        loading={remove.isPending}
        onPress={confirmDelete}
      />
    </Screen>
  );
}
