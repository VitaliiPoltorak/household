import { useRouter } from 'expo-router';
import { useState } from 'react';
import { CategoryForm } from '../../../src/components/CategoryForm';
import type { CategoryFormValues } from '../../../src/components/CategoryForm';
import { Screen } from '../../../src/components/Screen';
import {
  useAllCategories,
  useCategoryMutations,
} from '../../../src/hooks/useCategoryManagement';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';

export default function NewCategoryScreen() {
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const categories = useAllCategories(hid);
  const { create } = useCategoryMutations(hid);
  const [error, setError] = useState('');

  const submit = async (v: CategoryFormValues) => {
    setError('');
    try {
      await create.mutateAsync(v);
      router.back();
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  return (
    <Screen>
      <CategoryForm
        categories={categories.data ?? []}
        submitLabel="Create category"
        error={error}
        busy={create.isPending}
        onSubmit={submit}
      />
    </Screen>
  );
}
