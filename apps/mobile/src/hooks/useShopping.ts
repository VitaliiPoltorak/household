import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shoppingApi } from '../api/shopping';
import type { ItemInput, UpdateItemInput } from '../api/shopping';
import type { ListStatus } from '../api/types';

// Query keys match apps/web so the realtime bridge (#367) can invalidate both alike.
export function useShoppingLists(hid: string | undefined, status: ListStatus) {
  return useQuery({
    queryKey: ['shopping-lists', hid, status],
    queryFn: () => shoppingApi.getLists(hid!, status),
    enabled: !!hid,
  });
}

export function useShoppingList(id: string, hid: string | undefined) {
  return useQuery({
    queryKey: ['shopping-list', id, hid],
    queryFn: () => shoppingApi.getList(id, hid!),
    enabled: !!hid,
  });
}

export function useShoppingMutations(hid: string, listId?: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['shopping-lists', hid] });
    if (listId) {
      void qc.invalidateQueries({ queryKey: ['shopping-list', listId, hid] });
    }
  };
  return {
    createList: useMutation({
      mutationFn: (name: string) => shoppingApi.createList(hid, { name }),
      onSuccess: refresh,
    }),
    deleteList: useMutation({
      mutationFn: (id: string) => shoppingApi.deleteList(id, hid),
      onSuccess: refresh,
    }),
    completeList: useMutation({
      mutationFn: (id: string) => shoppingApi.completeList(id, hid),
      onSuccess: refresh,
    }),
    addItem: useMutation({
      mutationFn: (data: ItemInput) =>
        shoppingApi.addItem(listId!, hid, data),
      onSuccess: refresh,
    }),
    bulkAdd: useMutation({
      mutationFn: (names: string[]) =>
        shoppingApi.bulkAddItems(listId!, hid, names),
      onSuccess: refresh,
    }),
    updateItem: useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateItemInput }) =>
        shoppingApi.updateItem(listId!, id, hid, data),
      onSuccess: refresh,
    }),
    deleteItem: useMutation({
      mutationFn: (id: string) => shoppingApi.deleteItem(listId!, id, hid),
      onSuccess: refresh,
    }),
  };
}
