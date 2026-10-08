import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ErrorText } from '../../../src/components/ErrorText';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import { useShoppingMutations } from '../../../src/hooks/useShopping';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';

export default function NewListScreen() {
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const { createList } = useShoppingMutations(hid);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setError('');
    try {
      const list = await createList.mutateAsync(name.trim());
      router.replace({ pathname: '/shopping/[id]', params: { id: list.id } });
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  return (
    <Screen>
      <ErrorText message={error} />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
        autoFocus
      />
      <PrimaryButton
        label="Create list"
        onPress={submit}
        loading={createList.isPending}
      />
    </Screen>
  );
}
