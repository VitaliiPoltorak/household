import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AccountForm } from '../../../src/components/AccountForm';
import type { AccountFormValues } from '../../../src/components/AccountForm';
import { Screen } from '../../../src/components/Screen';
import {
  useAccountMutations,
  useEnabledAccountTypes,
} from '../../../src/hooks/useAccounts';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';

export default function NewAccountScreen() {
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const types = useEnabledAccountTypes(hid);
  const { create } = useAccountMutations(hid);
  const [error, setError] = useState('');

  const submit = async (v: AccountFormValues) => {
    setError('');
    try {
      await create.mutateAsync({
        name: v.name,
        type: v.type,
        currency: v.currency,
        allowsNegativeBalance: v.allowsNegativeBalance,
        ...(v.initialBalance !== undefined
          ? { initialBalance: v.initialBalance }
          : {}),
      });
      router.back();
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  return (
    <Screen>
      <AccountForm
        enabledTypes={types.data ?? []}
        submitLabel="Create account"
        error={error}
        busy={create.isPending}
        onSubmit={submit}
      />
    </Screen>
  );
}
