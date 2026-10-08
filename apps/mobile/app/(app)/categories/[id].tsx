import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text } from 'react-native';
import { ApiError } from '../../../src/api/errors';
import { CategoryForm } from '../../../src/components/CategoryForm';
import type { CategoryFormValues } from '../../../src/components/CategoryForm';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import {
  useAllCategories,
  useCategoryImpact,
  useCategoryMutations,
} from '../../../src/hooks/useCategoryManagement';
import { useHousehold } from '../../../src/household/HouseholdContext';
import {
  describeImpact,
  impactTotal,
} from '../../../src/lib/categories';
import { financeErrorMessage } from '../../../src/lib/finance-errors';

export default function EditCategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id ?? '';
  const categories = useAllCategories(hid);
  const { update, archive, unarchive, permanentDelete } =
    useCategoryMutations(hid);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const category = categories.data?.find((c) => c.id === id);
  const impact = useCategoryImpact(id, hid, deleting);

  if (!category) {
    return (
      <Screen>
        <Notice
          title={categories.isLoading ? 'Loading…' : 'Category not found'}
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

  const save = (v: CategoryFormValues) =>
    run(() => update.mutateAsync({ id: category.id, data: v }));

  const confirmArchive = () =>
    Alert.alert(
      'Archive category?',
      `"${category.name}" will be hidden from pickers. Existing transactions keep it, and you can restore it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => void run(() => archive.mutateAsync(category.id)),
        },
      ],
    );

  const confirmPermanentDelete = () =>
    Alert.alert(
      'Delete permanently?',
      `"${category.name}" will be removed for good. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setError('');
            try {
              await permanentDelete.mutateAsync(category.id);
              router.back();
            } catch (err) {
              // 409: dependents appeared since the impact check; refresh the counts.
              if (err instanceof ApiError && err.status === 409) {
                void impact.refetch();
                setError('This category is still in use and can’t be deleted.');
              } else {
                setError(financeErrorMessage(err));
              }
            }
          },
        },
      ],
    );

  if (category.isArchived) {
    const blocked = impact.data ? impactTotal(impact.data) > 0 : false;
    return (
      <Screen>
        <Notice
          title={`"${category.name}" is archived`}
          body="Restore it to use it again, or delete it permanently."
        />
        {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
        <PrimaryButton
          label="Restore"
          loading={unarchive.isPending}
          onPress={() => void run(() => unarchive.mutateAsync(category.id))}
        />
        {deleting ? (
          impact.isLoading ? (
            <ActivityIndicator />
          ) : impact.isError ? (
            <Notice
              title="Couldn't check usage"
              actionLabel="Try again"
              onAction={() => void impact.refetch()}
            />
          ) : blocked ? (
            <Notice
              title="Can't delete yet"
              body={`Still used by ${describeImpact(impact.data!)}. Reassign or remove them first.`}
            />
          ) : (
            <PrimaryButton
              label="Delete permanently"
              variant="secondary"
              loading={permanentDelete.isPending}
              onPress={confirmPermanentDelete}
            />
          )
        ) : (
          <PrimaryButton
            label="Delete permanently…"
            variant="secondary"
            onPress={() => setDeleting(true)}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <CategoryForm
        key={category.id}
        category={category}
        categories={categories.data ?? []}
        submitLabel="Save"
        error={error}
        busy={update.isPending}
        onSubmit={save}
      />
      <PrimaryButton
        label="Archive category"
        variant="secondary"
        loading={archive.isPending}
        onPress={confirmArchive}
      />
    </Screen>
  );
}
