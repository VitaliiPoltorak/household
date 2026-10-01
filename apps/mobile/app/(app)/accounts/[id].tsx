import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { AccountForm } from '../../../src/components/AccountForm';
import type { AccountFormValues } from '../../../src/components/AccountForm';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import {
  useAccountMutations,
  useAccounts,
  useEnabledAccountTypes,
} from '../../../src/hooks/useAccounts';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';

export default function EditAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const accounts = useAccounts(hid);
  const types = useEnabledAccountTypes(hid);
  const { update, archive } = useAccountMutations(hid);
  const [error, setError] = useState('');

  const account = accounts.data?.find((a) => a.id === id);
  if (!account) {
    return (
      <Screen>
        <Notice title={accounts.isLoading ? 'Loading…' : 'Account not found'} />
      </Screen>
    );
  }

  const save = async (v: AccountFormValues) => {
    setError('');
    try {
      await update.mutateAsync({
        id: account.id,
        data: {
          name: v.name,
          type: v.type,
          currency: v.currency,
          allowsNegativeBalance: v.allowsNegativeBalance,
        },
      });
      router.back();
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  const confirmArchive = () =>
    Alert.alert(
      'Archive account?',
      `"${account.name}" will be hidden. Its transactions are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archive.mutateAsync(account.id);
              router.back();
            } catch (err) {
              setError(financeErrorMessage(err));
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <AccountForm
        key={account.id}
        account={account}
        enabledTypes={types.data ?? []}
        submitLabel="Save"
        error={error}
        busy={update.isPending}
        onSubmit={save}
      />
      <PrimaryButton
        label="Archive account"
        variant="secondary"
        loading={archive.isPending}
        onPress={confirmArchive}
      />
    </Screen>
  );
}
