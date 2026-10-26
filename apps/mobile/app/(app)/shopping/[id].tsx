import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ShoppingListItem } from '../../../src/api/types';
import { AddItems } from '../../../src/components/AddItems';
import { ErrorText } from '../../../src/components/ErrorText';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import {
  useShoppingList,
  useShoppingMutations,
} from '../../../src/hooks/useShopping';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { financeErrorMessage } from '../../../src/lib/finance-errors';
import { formatQuantity, progress, sortItems } from '../../../src/lib/shopping';

function ItemRow({
  item,
  editable,
  onToggle,
  onEdit,
}: {
  item: ShoppingListItem;
  editable: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const qty = formatQuantity(item);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.isPurchased, disabled: !editable }}
        accessibilityLabel={item.name}
        disabled={!editable}
        onPress={onToggle}
        hitSlop={8}
      >
        <Ionicons
          name={item.isPurchased ? 'checkbox' : 'square-outline'}
          size={26}
          color={item.isPurchased ? '#2563eb' : '#9ca3af'}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!editable}
        onPress={onEdit}
        style={styles.rowMain}
      >
        <Text style={[styles.name, item.isPurchased && styles.done]}>
          {item.name}
        </Text>
        {qty ? <Text style={styles.meta}>{qty}</Text> : null}
      </Pressable>
    </View>
  );
}

export default function ShoppingListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const hid = useHousehold().activeHousehold?.id;
  const list = useShoppingList(id, hid);
  const m = useShoppingMutations(hid ?? '', id);
  const [error, setError] = useState('');

  if (list.isLoading || !hid) {
    return (
      <Screen>
        <ActivityIndicator style={styles.loader} />
      </Screen>
    );
  }
  if (list.isError || !list.data) {
    return (
      <Screen>
        <Notice
          title="Couldn't load this list"
          actionLabel="Try again"
          onAction={() => void list.refetch()}
        />
      </Screen>
    );
  }

  const data = list.data;
  const editable = data.status === 'active';
  const { done, total } = progress(data.items);

  const run = async (action: () => Promise<unknown>, leave = false) => {
    setError('');
    try {
      await action();
      if (leave) router.back();
    } catch (err) {
      setError(financeErrorMessage(err));
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete list?', `"${data.name}" and its items will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void run(() => m.deleteList.mutateAsync(data.id), true),
      },
    ]);

  const confirmComplete = () =>
    Alert.alert('Complete list?', 'It moves to Completed and becomes read-only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () =>
          void run(() => m.completeList.mutateAsync(data.id), true),
      },
    ]);

  return (
    <Screen scroll={false}>
      <Text style={styles.title}>{data.name}</Text>
      <Text style={styles.meta}>
        {total === 0 ? 'No items yet' : `${done} of ${total} bought`}
        {editable ? '' : ` · ${data.status}`}
      </Text>
      <FlatList
        data={sortItems(data.items)}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            editable={editable}
            onToggle={() =>
              void run(() =>
                m.updateItem.mutateAsync({
                  id: item.id,
                  data: { isPurchased: !item.isPurchased },
                }),
              )
            }
            onEdit={() =>
              router.push({
                pathname: '/shopping/item',
                params: { listId: data.id, itemId: item.id },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListHeaderComponent={
          editable ? (
            <AddItems
              existingNames={data.items.map((i) => i.name)}
              busy={m.addItem.isPending || m.bulkAdd.isPending}
              error={error}
              onAdd={(name) => run(() => m.addItem.mutateAsync({ name }))}
              onBulkAdd={(names) => run(() => m.bulkAdd.mutateAsync(names))}
            />
          ) : (
            <ErrorText message={error} />
          )
        }
        ListEmptyComponent={<Notice title="This list is empty" />}
        ListFooterComponent={
          <View style={styles.footer}>
            {editable ? (
              <PrimaryButton
                label="Complete list"
                loading={m.completeList.isPending}
                onPress={confirmComplete}
              />
            ) : null}
            <PrimaryButton
              label="Delete list"
              variant="secondary"
              loading={m.deleteList.isPending}
              onPress={confirmDelete}
            />
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
          />
        }
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  list: { flexGrow: 1, paddingTop: 8 },
  sep: { height: 1, backgroundColor: '#eee' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowMain: { flex: 1 },
  name: { fontSize: 16, color: '#111' },
  done: { color: '#9ca3af', textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  footer: { gap: 8, paddingTop: 16 },
});
