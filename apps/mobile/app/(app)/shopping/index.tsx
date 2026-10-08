import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ListStatus, ShoppingList } from '../../../src/api/types';
import { Chips } from '../../../src/components/Chips';
import { Notice } from '../../../src/components/QueryState';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Screen } from '../../../src/components/Screen';
import { useShoppingLists } from '../../../src/hooks/useShopping';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { progress } from '../../../src/lib/shopping';

function ListRow({ list }: { list: ShoppingList }) {
  const router = useRouter();
  const { done, total } = progress(list.items);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/shopping/[id]', params: { id: list.id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.name}>{list.name}</Text>
      <Text style={styles.meta}>
        {total === 0 ? 'Empty' : `${done}/${total}`}
      </Text>
    </Pressable>
  );
}

export default function ShoppingScreen() {
  const router = useRouter();
  const household = useHousehold();
  const hid = household.activeHousehold?.id;
  const [status, setStatus] = useState<ListStatus>('active');
  const lists = useShoppingLists(hid, status);

  let body;
  if (household.isLoading || (hid && lists.isLoading)) {
    body = <ActivityIndicator style={styles.loader} />;
  } else if (household.isError) {
    body = (
      <Notice
        title="Couldn't load your households"
        actionLabel="Try again"
        onAction={household.refetch}
      />
    );
  } else if (!hid) {
    body = (
      <Notice
        title="No household yet"
        body="Create or join a household to start shopping lists."
      />
    );
  } else if (lists.isError) {
    body = (
      <Notice
        title="Couldn't load lists"
        actionLabel="Try again"
        onAction={() => void lists.refetch()}
      />
    );
  } else {
    body = (
      <FlatList
        data={lists.data}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => <ListRow list={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Notice
            title={
              status === 'active' ? 'No active lists' : 'No completed lists'
            }
            body={
              status === 'active'
                ? 'Create a list to start adding items.'
                : undefined
            }
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={lists.isRefetching}
            onRefresh={() => void lists.refetch()}
          />
        }
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <Screen
      title="Shopping"
      subtitle={household.activeHousehold?.name}
      scroll={false}
    >
      <Chips
        label="Show"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'completed', label: 'Completed' },
        ]}
        value={status}
        onChange={(v) => setStatus(v as ListStatus)}
      />
      {body}
      {hid ? (
        <PrimaryButton
          label="New list"
          onPress={() => router.push('/shopping/new')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 32 },
  list: { flexGrow: 1 },
  sep: { height: 1, backgroundColor: '#eee' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  pressed: { opacity: 0.6 },
  name: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1 },
  meta: { fontSize: 14, color: '#666', fontVariant: ['tabular-nums'] },
});
