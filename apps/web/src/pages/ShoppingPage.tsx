import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '../contexts/HouseholdContext';
import { useAuth } from '../contexts/AuthContext';
import { shoppingApi } from '../api/shopping';
import type { ShoppingList, ShoppingListItem } from '../types/api';
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
    mutationFn: ({ listId, name, quantity }: { listId: string; name: string; quantity: number }) =>
      shoppingApi.addItem(listId, hid, uid, { name, quantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', selectedList?.id] }),
  });

  const toggleItem = useMutation({
    mutationFn: ({ listId, itemId, isPurchased }: { listId: string; itemId: string; isPurchased: boolean }) =>
      shoppingApi.updateItem(listId, itemId, hid, uid, { isPurchased }),
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
          <Button size="sm" onClick={() => setShowCreate(true)}>{t('shopping.newList')}</Button>
        </div>

        {/* Status tabs */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-800">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
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
            onComplete={() => completeList.mutate(selectedList.id)}
            onDelete={() => deleteList.mutate(selectedList.id)}
            onAddItem={(name, quantity) => addItem.mutate({ listId: selectedList.id, name, quantity })}
            onToggleItem={(itemId, isPurchased) =>
              toggleItem.mutate({ listId: selectedList.id, itemId, isPurchased })
            }
            onDeleteItem={(itemId) => deleteItem.mutate({ listId: selectedList.id, itemId })}
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
    </div>
  );
}

function ListDetail({
  list, onComplete, onDelete, onAddItem, onToggleItem, onDeleteItem,
}: {
  list: ShoppingList;
  onComplete: () => void;
  onDelete: () => void;
  onAddItem: (name: string, qty: number) => void;
  onToggleItem: (itemId: string, purchased: boolean) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const [newItem, setNewItem] = useState('');
  const [qty, setQty] = useState('1');

  const purchased = list.items?.filter((i) => i.isPurchased).length ?? 0;
  const total = list.items?.length ?? 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    onAddItem(newItem.trim(), parseInt(qty) || 1);
    setNewItem('');
    setQty('1');
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
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={t('shopping.itemName')}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <input
            type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
            className="w-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            title={t('shopping.quantity')}
          />
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
              onToggle={() => onToggleItem(item.id, !item.isPurchased)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item, isActive, onToggle, onDelete,
}: {
  item: ShoppingListItem;
  isActive: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
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
      </span>
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

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />;
}
