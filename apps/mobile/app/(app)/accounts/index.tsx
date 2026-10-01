import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Account } from '../../../src/api/types';
import { Notice } from '../../../src/components/QueryState';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Screen } from '../../../src/components/Screen';
import { useAccounts } from '../../../src/hooks/useAccounts';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { formatMoney } from '../../../src/lib/money';

function AccountRow({ account }: { account: Account }) {
  const router = useRouter();
  const balance = Number(account.balance);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/accounts/[id]', params: { id: account.id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.name}>{account.name}</Text>
        <Text style={styles.meta}>
          {account.type} · {account.currency}
        </Text>
      </View>
      <Text style={[styles.balance, balance < 0 && styles.negative]}>
        {formatMoney(balance, account.currency)}
      </Text>
    </Pressable>
  );
}

export default function AccountsScreen() {
  const router = useRouter();
  const household = useHousehold();
  const hid = household.activeHousehold?.id;
  const accounts = useAccounts(hid);

  let body;
  if (household.isLoading || (hid && accounts.isLoading)) {
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
        body="Create or join a household to start tracking accounts."
      />
    );
  } else if (accounts.isError) {
    body = (
      <Notice
        title="Couldn't load accounts"
        actionLabel="Try again"
        onAction={() => void accounts.refetch()}
      />
    );
  } else {
    body = (
      <FlatList
        data={accounts.data}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AccountRow account={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Notice
            title="No accounts yet"
            body="Add your first account to start tracking balances."
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={accounts.isRefetching}
            onRefresh={() => void accounts.refetch()}
          />
        }
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <Screen
      title="Accounts"
      subtitle={household.activeHousehold?.name}
      scroll={false}
    >
      {body}
      {hid ? (
        <PrimaryButton
          label="Add account"
          onPress={() => router.push('/accounts/new')}
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
  rowMain: { flex: 1, paddingRight: 12 },
  name: { fontSize: 16, fontWeight: '600', color: '#111' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  balance: { fontSize: 16, fontVariant: ['tabular-nums'], color: '#111' },
  negative: { color: '#b91c1c' },
});
