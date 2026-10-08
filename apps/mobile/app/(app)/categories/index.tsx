import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Category } from '../../../src/api/types';
import { Notice } from '../../../src/components/QueryState';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Screen } from '../../../src/components/Screen';
import { useAllCategories } from '../../../src/hooks/useCategoryManagement';
import { useHousehold } from '../../../src/household/HouseholdContext';
import { groupCategories } from '../../../src/lib/categories';

function CategoryRow({ category }: { category: Category }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/categories/[id]',
          params: { id: category.id },
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.icon}>{category.icon ?? ''}</Text>
      <Text style={[styles.name, category.parentId && styles.child]}>
        {category.name}
      </Text>
    </Pressable>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const household = useHousehold();
  const hid = household.activeHousehold?.id;
  const categories = useAllCategories(hid);
  const [showArchived, setShowArchived] = useState(false);

  const { sections, archived } = useMemo(
    () => groupCategories(categories.data ?? []),
    [categories.data],
  );
  const listSections = useMemo(
    () => [
      ...sections,
      ...(showArchived && archived.length
        ? [{ type: 'archived', title: 'Archived', data: archived }]
        : []),
    ],
    [sections, archived, showArchived],
  );

  let body;
  if (household.isLoading || (hid && categories.isLoading)) {
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
        body="Create or join a household to manage categories."
      />
    );
  } else if (categories.isError) {
    body = (
      <Notice
        title="Couldn't load categories"
        actionLabel="Try again"
        onAction={() => void categories.refetch()}
      />
    );
  } else {
    body = (
      <SectionList
        sections={listSections}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <CategoryRow category={item} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.section}>{section.title}</Text>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Notice
            title="No categories yet"
            body="Add a category to organise your income and expenses."
          />
        }
        ListFooterComponent={
          archived.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowArchived((v) => !v)}
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>
                {showArchived
                  ? 'Hide archived'
                  : `Show archived (${archived.length})`}
              </Text>
            </Pressable>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={categories.isRefetching}
            onRefresh={() => void categories.refetch()}
          />
        }
        contentContainerStyle={styles.list}
      />
    );
  }

  return (
    <Screen
      title="Categories"
      subtitle={household.activeHousehold?.name}
      scroll={false}
    >
      {body}
      {hid ? (
        <PrimaryButton
          label="Add category"
          onPress={() => router.push('/categories/new')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 32 },
  list: { flexGrow: 1 },
  sep: { height: 1, backgroundColor: '#eee' },
  section: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  pressed: { opacity: 0.6 },
  icon: { width: 28, fontSize: 18 },
  name: { fontSize: 16, color: '#111', flex: 1 },
  child: { paddingLeft: 16, color: '#444' },
  toggle: { paddingVertical: 16, alignItems: 'center' },
  toggleText: { color: '#2563eb', fontSize: 14, fontWeight: '500' },
});
