import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TransactionFilters } from '../../../src/api/finance';
import type { Account, Category, Transaction } from '../../../src/api/types';
import { Chips } from '../../../src/components/Chips';
import { DateField } from '../../../src/components/DateField';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Notice } from '../../../src/components/QueryState';
import { Screen } from '../../../src/components/Screen';
import { categoryLabel } from '../../../src/components/TransactionForm';
import { useAccounts } from '../../../src/hooks/useAccounts';
import {
  useCategories,
  useTransactions,
} from '../../../src/hooks/useTransactions';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { isIsoDate } from '../../../src/lib/dates';
import { formatMoney } from '../../../src/lib/money';

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'adjustment', label: 'Adjustment' },
];

function TxRow({
  tx,
  accountName,
  counterName,
  category,
}: {
  tx: Transaction;
  accountName: string;
  counterName?: string;
  category?: string;
}) {
  const router = useRouter();
  const amount = Number(tx.amount);
  const sign = tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : '';
  const where =
    tx.type === 'transfer' && counterName
      ? `${accountName} → ${counterName}`
      : accountName;
  const crossLeg =
    tx.type === 'transfer' &&
    tx.counterAmount !== null &&
    tx.counterCurrency &&
    tx.counterCurrency !== tx.currency
      ? ` → ${formatMoney(Number(tx.counterAmount), tx.counterCurrency)}`
      : '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/transactions/[id]', params: { id: tx.id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.desc} numberOfLines={1}>
          {tx.description || where}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {tx.date.slice(0, 10)} · {where}
          {category ? ` · ${category}` : ''}
        </Text>
      </View>
      <Text
        style={[
          styles.amount,
          tx.type === 'income' && styles.income,
          tx.type === 'expense' && styles.expense,
        ]}
      >
        {sign}
        {formatMoney(amount, tx.currency)}
        {crossLeg}
      </Text>
    </Pressable>
  );
}

export default function TransactionsScreen() {
  const router = useRouter();
  const household = useHousehold();
  const hid = household.activeHousehold?.id;
  const accounts = useAccounts(hid);
  const categories = useCategories(hid);

  const [showFilters, setShowFilters] = useState(false);
  const [type, setType] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // A half-typed date must not fire requests (or 400s): apply only complete ones.
  const filters: TransactionFilters = {
    type,
    accountId,
    categoryId,
    from: isIsoDate(from) ? from : '',
    to: isIsoDate(to) ? to : '',
  };
  const activeCount = Object.values(filters).filter(Boolean).length;
  const txs = useTransactions(hid, filters);

  const accountById = useMemo(
    () => new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a])),
    [accounts.data],
  );
  const catById = useMemo(
    () =>
      new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  const clear = () => {
    setType('');
    setAccountId('');
    setCategoryId('');
    setFrom('');
    setTo('');
  };

  let body;
  if (household.isLoading || (hid && txs.isLoading)) {
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
        body="Create or join a household to record transactions."
      />
    );
  } else if (txs.isError) {
    body = (
      <Notice
        title="Couldn't load transactions"
        actionLabel="Try again"
        onAction={() => void txs.refetch()}
      />
    );
  } else {
    body = (
      <FlatList
        data={txs.data}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TxRow
            tx={item}
            accountName={accountById.get(item.accountId)?.name ?? '—'}
            counterName={
              item.counterAccountId
                ? accountById.get(item.counterAccountId)?.name
                : undefined
            }
            category={
              item.categoryId && catById.get(item.categoryId)
                ? categoryLabel(
                    catById.get(item.categoryId)!,
                    categories.data ?? [],
                  )
                : undefined
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Notice
            title={
              activeCount ? 'No matching transactions' : 'No transactions yet'
            }
            body={
              activeCount
                ? 'Try changing or clearing the filters.'
                : 'Add your first transaction to see it here.'
            }
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={txs.isRefetching}
            onRefresh={() => void txs.refetch()}
          />
        }
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <Screen
      title="Transactions"
      subtitle={household.activeHousehold?.name}
      scroll={false}
    >
      {hid ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowFilters((v) => !v)}
          >
            <Text style={styles.filterToggle}>
              {showFilters ? 'Hide filters' : 'Filters'}
              {activeCount ? ` (${activeCount})` : ''}
            </Text>
          </Pressable>
          {showFilters ? (
            <View style={styles.filters}>
              <Chips
                label="Type"
                options={TYPE_OPTIONS}
                value={type}
                onChange={setType}
              />
              <Chips
                label="Account"
                options={[
                  { value: '', label: 'All' },
                  ...(accounts.data ?? []).map((a) => ({
                    value: a.id,
                    label: a.name,
                  })),
                ]}
                value={accountId}
                onChange={setAccountId}
              />
              <Chips
                label="Category"
                options={[
                  { value: '', label: 'All' },
                  ...(categories.data ?? [])
                    .filter((c) => !c.isArchived)
                    .map((c) => ({
                      value: c.id,
                      label: categoryLabel(c, categories.data ?? []),
                    })),
                ]}
                value={categoryId}
                onChange={setCategoryId}
              />
              <DateField label="From" value={from} onChangeText={setFrom} />
              <DateField label="To" value={to} onChangeText={setTo} />
              {activeCount ? (
                <PrimaryButton
                  label="Clear filters"
                  variant="secondary"
                  onPress={clear}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
      {body}
      {hid ? (
        <PrimaryButton
          label="Add transaction"
          onPress={() => router.push('/transactions/new')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 32 },
  list: { flexGrow: 1 },
  sep: { height: 1, backgroundColor: '#eee' },
  filterToggle: { color: '#2563eb', fontSize: 15, fontWeight: '500' },
  filters: { gap: 10, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  pressed: { opacity: 0.6 },
  rowMain: { flex: 1, paddingRight: 12 },
  desc: { fontSize: 16, fontWeight: '500', color: '#111' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  amount: { fontSize: 15, fontVariant: ['tabular-nums'], color: '#111' },
  income: { color: '#15803d' },
  expense: { color: '#b91c1c' },
});
