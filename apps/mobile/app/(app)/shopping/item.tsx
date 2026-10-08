import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ErrorText } from '../../../src/components/ErrorText';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import { TextField } from '../../../src/components/TextField';
import {
  useShoppingList,
  useShoppingMutations,
} from '../../../src/hooks/useShopping';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';
import { MIN_ITEM_NAME } from '../../../src/lib/shopping';

export default function EditItemScreen() {
  const { listId, itemId } = useLocalSearchParams<{
    listId: string;
    itemId: string;
  }>();
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id;
  const list = useShoppingList(listId, hid);
  const { updateItem, deleteItem } = useShoppingMutations(hid ?? '', listId);
  const item = list.data?.items.find((i) => i.id === itemId);

  if (!item) {
    return (
      <Screen>
        <Notice title={list.isLoading ? 'Loading…' : 'Item not found'} />
      </Screen>
    );
  }
  return (
    <ItemForm
      key={item.id}
      initial={{
        name: item.name,
        quantity: String(Number(item.quantity)),
        unit: item.unit ?? '',
      }}
      saving={updateItem.isPending}
      deleting={deleteItem.isPending}
      onSave={async (data) => {
        await updateItem.mutateAsync({ id: item.id, data });
        router.back();
      }}
      onDelete={async () => {
        await deleteItem.mutateAsync(item.id);
        router.back();
      }}
    />
  );
}

function ItemForm({
  initial,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  initial: { name: string; quantity: string; unit: string };
  saving: boolean;
  deleting: boolean;
  onSave: (data: {
    name: string;
    quantity: number;
    unit: string;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [unit, setUnit] = useState(initial.unit);
  const [error, setError] = useState('');

  const save = async () => {
    const q = parseFloat(quantity.replace(',', '.'));
    if (name.trim().length < MIN_ITEM_NAME) {
      setError(`Name needs at least ${MIN_ITEM_NAME} characters.`);
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }
    setError('');
    try {
      await onSave({
        name: name.trim(),
        quantity: q,
        // Sent even when blank so an existing unit can be cleared.
        unit: unit.trim(),
      });
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete item?', `"${initial.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void onDelete().catch((err) => setError(financeErrorMessage(err))),
      },
    ]);

  return (
    <Screen>
      <ErrorText message={error} />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
      />
      <TextField
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="numbers-and-punctuation"
      />
      <TextField label="Unit (optional)" value={unit} onChangeText={setUnit} />
      <PrimaryButton label="Save" onPress={save} loading={saving} />
      <PrimaryButton
        label="Delete item"
        variant="secondary"
        loading={deleting}
        onPress={confirmDelete}
      />
    </Screen>
  );
}
