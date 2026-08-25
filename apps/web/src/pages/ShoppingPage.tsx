import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { useAuth } from '../contexts/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { shoppingApi } from '../api/shopping';
import { ApiError } from '../api/client';
import type { ShoppingList, ShoppingListItem, Store, StoreType, StoreImpact, Product } from '../types/api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type StatusFilter = 'active' | 'completed' | 'archived';

export function ShoppingPage() {
  const { t } = useTranslation();
  const { activeHousehold } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();
  const hid = activeHousehold?.id ?? '';
  const uid = user?.id ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showStores, setShowStores] = useState(false);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['shopping-lists', hid, statusFilter],
    queryFn: () => shoppingApi.getLists(hid, statusFilter),
    enabled: !!hid,
  });
  // Backend now sorts alphabetically (matches the earlier client-side intent).
  // Sorting in one place only prevents the browser-locale vs SQL-collation
  // mismatch we had before #79.

  const { data: openList } = useQuery({
    queryKey: ['shopping-list', selectedList?.id, hid],
    queryFn: () => shoppingApi.getList(selectedList!.id, hid),
    enabled: !!selectedList,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['stores', hid],
    queryFn: () => shoppingApi.getStores(hid),
    enabled: !!hid,
  });
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const createList = useMutation({
    mutationFn: (name: string) => shoppingApi.createList(hid, uid, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-lists', hid] }),
  });

  const completeList = useMutation({
    mutationFn: (id: string) => shoppingApi.completeList(id, hid, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-lists', hid] });
      qc.invalidateQueries({ queryKey: ['shopping-list', selectedList?.id] });
    },
  });

  const deleteList = useMutation({
    mutationFn: (id: string) => shoppingApi.deleteList(id, hid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-lists', hid] });
      setSelectedList(null);
    },
  });

  const addItem = useMutation({
    mutationFn: (
      { listId, name, quantity, preferredStoreId, productId }:
      { listId: string; name: string; quantity: number; preferredStoreId?: string; productId?: string },
    ) => shoppingApi.addItem(listId, hid, uid, { name, quantity, preferredStoreId, productId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', selectedList?.id] }),
  });

  const toggleItem = useMutation({
    mutationFn: ({ listId, itemId, isPurchased }: { listId: string; itemId: string; isPurchased: boolean }) =>
      shoppingApi.updateItem(listId, itemId, hid, uid, { isPurchased }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', selectedList?.id] }),
  });

  const setActualStore = useMutation({
    mutationFn: ({ listId, itemId, actualStoreId }: { listId: string; itemId: string; actualStoreId: string }) =>
      shoppingApi.updateItem(listId, itemId, hid, uid, { actualStoreId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', selectedList?.id] }),
  });

  const deleteItem = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      shoppingApi.deleteItem(listId, itemId, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', selectedList?.id] }),
  });

  if (!activeHousehold) return <p className="text-gray-500 dark:text-gray-400">Select a household first.</p>;

  const statuses: StatusFilter[] = ['active', 'completed', 'archived'];

  return (
    <div className="flex h-full gap-6">
      {/* Lists panel */}
      <div className="flex w-72 shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('shopping.title')}</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowStores(true)}>{t('shopping.manageStores')}</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>{t('shopping.newList')}</Button>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-800">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setSelectedList(null);
              }}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t(`shopping.${s}`)}
            </button>
          ))}
        </div>

        {/* List items */}
        {isLoading ? (
          <Spinner />
        ) : lists.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">{t('shopping.emptyLists')}</p>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setSelectedList(list)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  selectedList?.id === list.id
                    ? 'border-primary-300 bg-primary-50 dark:border-primary-500/60 dark:bg-primary-900/40'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700'
                }`}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{list.name}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(list.createdAt).toLocaleDateString()} ·{' '}
                  {list.items?.length ?? 0} items
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <div className="flex-1">
        {!selectedList ? (
          <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
            <p>Select a list to view items</p>
          </div>
        ) : (
          <ListDetail
            list={openList ?? selectedList}
            hid={hid}
            stores={stores}
            storeById={storeById}
            onComplete={() => completeList.mutate(selectedList.id)}
            onDelete={() => deleteList.mutate(selectedList.id)}
            onAddItem={(name, quantity, preferredStoreId, productId) =>
              addItem.mutate({ listId: selectedList.id, name, quantity, preferredStoreId, productId })
            }
            onToggleItem={(itemId, isPurchased) =>
              toggleItem.mutate({ listId: selectedList.id, itemId, isPurchased })
            }
            onDeleteItem={(itemId) => deleteItem.mutate({ listId: selectedList.id, itemId })}
            onSetActualStore={(itemId, actualStoreId) =>
              setActualStore.mutate({ listId: selectedList.id, itemId, actualStoreId })
            }
          />
        )}
      </div>

      {showCreate && (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onCreate={(name) => {
            createList.mutate(name);
            setShowCreate(false);
          }}
        />
      )}

      {showStores && (
        <StoreManagerModal stores={stores} hid={hid} uid={uid} onClose={() => setShowStores(false)} />
      )}
    </div>
  );
}

function ListDetail({
  list, hid, stores, storeById, onComplete, onDelete, onAddItem, onToggleItem, onDeleteItem, onSetActualStore,
}: {
  list: ShoppingList;
  hid: string;
  stores: Store[];
  storeById: Map<string, Store>;
  onComplete: () => void;
  onDelete: () => void;
  onAddItem: (name: string, qty: number, preferredStoreId?: string, productId?: string) => void;
  onToggleItem: (itemId: string, purchased: boolean) => void;
  onDeleteItem: (itemId: string) => void;
  onSetActualStore: (itemId: string, storeId: string) => void;
}) {
  const { t } = useTranslation();
  const [newItem, setNewItem] = useState('');
  const [qty, setQty] = useState('1');
  const [newItemStoreId, setNewItemStoreId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);

  const purchased = list.items?.filter((i) => i.isPurchased).length ?? 0;
  const total = list.items?.length ?? 0;

  // Debounced so typing a product name doesn't fire a search request per
  // keystroke (#196).
  const debouncedQuery = useDebouncedValue(newItem.trim(), 200);
  const { data: suggestions = [] } = useQuery({
    queryKey: ['products-search', hid, debouncedQuery],
    queryFn: () => shoppingApi.getProducts(hid, debouncedQuery),
    enabled: !!hid && debouncedQuery.length > 0,
  });

  const selectSuggestion = (product: Product) => {
    setNewItem(product.name);
    setSelectedProductId(product.id);
    if (product.preferredStoreId && !newItemStoreId) setNewItemStoreId(product.preferredStoreId);
    setSuggestOpen(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    onAddItem(newItem.trim(), parseInt(qty) || 1, newItemStoreId || undefined, selectedProductId || undefined);
    setNewItem('');
    setQty('1');
    setNewItemStoreId('');
    setSelectedProductId('');
    setSuggestOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{list.name}</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500">{purchased}/{total} {t('shopping.purchased')}</p>
        </div>
        <div className="flex gap-2">
          {list.status === 'active' && (
            <Button size="sm" onClick={onComplete}>{t('shopping.complete')}</Button>
          )}
          <Button size="sm" variant="danger" onClick={onDelete}>{t('common.delete')}</Button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-1.5 rounded-full bg-green-500 transition-all"
            style={{ width: `${(purchased / total) * 100}%` }}
          />
        </div>
      )}

      {/* Add item form */}
      {list.status === 'active' && (
        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={newItem}
              onChange={(e) => {
                setNewItem(e.target.value);
                setSelectedProductId('');
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              placeholder={t('shopping.itemName')}
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            {suggestOpen && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectSuggestion(p);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <span>{p.name}</span>
                      {p.preferredStoreId && storeById.get(p.preferredStoreId) && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {storeById.get(p.preferredStoreId)!.name}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
            className="w-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            title={t('shopping.quantity')}
          />
          <select
            value={newItemStoreId}
            onChange={(e) => setNewItemStoreId(e.target.value)}
            title={t('shopping.preferredStore')}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">{t('shopping.noStore')}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button type="submit" size="sm">{t('shopping.addItem')}</Button>
        </form>
      )}

      {/* Items */}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        {(list.items ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No items yet.</p>
        ) : (
          (list.items ?? []).map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              isActive={list.status === 'active'}
              store={item.preferredStoreId ? storeById.get(item.preferredStoreId) ?? null : null}
              stores={stores}
              onToggle={() => onToggleItem(item.id, !item.isPurchased)}
              onDelete={() => onDeleteItem(item.id)}
              onSetActualStore={(storeId) => onSetActualStore(item.id, storeId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item, isActive, store, stores, onToggle, onDelete, onSetActualStore,
}: {
  item: ShoppingListItem;
  isActive: boolean;
  store: Store | null;
  stores: Store[];
  onToggle: () => void;
  onDelete: () => void;
  onSetActualStore: (storeId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {isActive && (
        <input
          type="checkbox"
          checked={item.isPurchased}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 dark:border-gray-600 dark:bg-gray-800"
        />
      )}
      <span
        className={`flex-1 text-sm ${
          item.isPurchased
            ? 'text-gray-400 line-through dark:text-gray-500'
            : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {item.name}
        {item.quantity > 1 && <span className="ml-1 text-gray-400 dark:text-gray-500">×{item.quantity}</span>}
        {store && (
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {store.name}
          </span>
        )}
      </span>
      {item.isPurchased && stores.length > 0 && (
        <select
          value={item.actualStoreId ?? ''}
          onChange={(e) => e.target.value && onSetActualStore(e.target.value)}
          title={t('shopping.boughtAt')}
          className="rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
        >
          <option value="">{t('shopping.boughtAt')}</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      {isActive && (
        <button onClick={onDelete} className="text-sm text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400">✕</button>
      )}
    </div>
  );
}

function CreateListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  return (
    <Modal title={t('shopping.newListTitle')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}
        className="space-y-4">
        <Input label={t('shopping.listName')} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekly groceries" autoFocus />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={!name.trim()}>{t('common.create')}</Button>
        </div>
      </form>
    </Modal>
  );
}

function StoreManagerModal({
  stores, hid, uid, onClose,
}: {
  stores: Store[];
  hid: string;
  uid: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<StoreType>('other');
  const [blocked, setBlocked] = useState<{ id: string; impact: StoreImpact } | null>(null);

  const createStore = useMutation({
    mutationFn: (data: { name: string; type: StoreType }) => shoppingApi.createStore(hid, uid, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores', hid] });
      setName('');
      setType('other');
    },
  });

  const deleteStore = useMutation({
    mutationFn: (id: string) => shoppingApi.deleteStore(id, hid),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['stores', hid] });
      setBlocked((b) => (b?.id === id ? null : b));
    },
    onError: (err: unknown, id) => {
      if (err instanceof ApiError && err.status === 409 && err.data?.['impact']) {
        setBlocked({ id, impact: err.data['impact'] as StoreImpact });
      }
    },
  });

  return (
    <Modal title={t('shopping.storesTitle')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createStore.mutate({ name: name.trim(), type });
        }}
        className="mb-4 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('shopping.storeName')}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as StoreType)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="supermarket">{t('shopping.storeTypes.supermarket')}</option>
          <option value="greengrocer">{t('shopping.storeTypes.greengrocer')}</option>
          <option value="pharmacy">{t('shopping.storeTypes.pharmacy')}</option>
          <option value="other">{t('shopping.storeTypes.other')}</option>
        </select>
        <Button type="submit" size="sm" disabled={!name.trim() || createStore.isPending}>
          {t('shopping.newStore')}
        </Button>
      </form>

      {stores.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">{t('shopping.noStores')}</p>
      ) : (
        <ul className="space-y-2">
          {stores.map((s) => (
            <li key={s.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t(`shopping.storeTypes.${s.type}`)}</p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteStore.mutate(s.id)}
                  disabled={deleteStore.isPending && deleteStore.variables === s.id}
                >
                  {t('common.delete')}
                </Button>
              </div>
              {blocked?.id === s.id && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {t('shopping.cannotDeleteStore', {
                    products: blocked.impact.products,
                    lists: blocked.impact.lists,
                    items: blocked.impact.items,
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />;
}
