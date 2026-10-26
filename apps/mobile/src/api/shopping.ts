import { api, householdHeaders } from './client';
import type { ListStatus, ShoppingList, ShoppingListItem } from './types';

export interface ItemInput {
  name: string;
  quantity?: number;
  unit?: string;
}

export type UpdateItemInput = Partial<ItemInput> & { isPurchased?: boolean };

// The gateway supplies X-User-Id from the verified JWT, so only the household
// header is sent from here.
export const shoppingApi = {
  getLists: (hid: string, status?: ListStatus) =>
    api.get<ShoppingList[]>('/shopping-lists', {
      headers: householdHeaders(hid),
      params: status ? { status } : {},
    }),

  getList: (id: string, hid: string) =>
    api.get<ShoppingList>(`/shopping-lists/${id}`, {
      headers: householdHeaders(hid),
    }),

  createList: (hid: string, data: { name: string }) =>
    api.post<ShoppingList>('/shopping-lists', data, {
      headers: householdHeaders(hid),
    }),

  deleteList: (id: string, hid: string) =>
    api.delete(`/shopping-lists/${id}`, { headers: householdHeaders(hid) }),

  completeList: (id: string, hid: string) =>
    api.post<ShoppingList>(
      `/shopping-lists/${id}/complete`,
      {},
      { headers: householdHeaders(hid) },
    ),

  addItem: (listId: string, hid: string, data: ItemInput) =>
    api.post<ShoppingListItem>(`/shopping-lists/${listId}/items`, data, {
      headers: householdHeaders(hid),
    }),

  bulkAddItems: (listId: string, hid: string, names: string[]) =>
    api.post<ShoppingListItem[]>(
      `/shopping-lists/${listId}/items/bulk`,
      { items: names.map((name) => ({ name })) },
      { headers: householdHeaders(hid) },
    ),

  updateItem: (
    listId: string,
    itemId: string,
    hid: string,
    data: UpdateItemInput,
  ) =>
    api.patch<ShoppingListItem>(
      `/shopping-lists/${listId}/items/${itemId}`,
      data,
      { headers: householdHeaders(hid) },
    ),

  deleteItem: (listId: string, itemId: string, hid: string) =>
    api.delete(`/shopping-lists/${listId}/items/${itemId}`, {
      headers: householdHeaders(hid),
    }),
};
