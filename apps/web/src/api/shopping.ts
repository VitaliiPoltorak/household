import { apiClient } from './client';
import type { Store, Product, ShoppingList, ShoppingListItem } from '../types/api';

const cfg = (hid: string) => ({ headers: { 'X-Household-Id': hid } });
const ctx = (hid: string, uid: string) => ({ headers: { 'X-Household-Id': hid, 'X-User-Id': uid } });

export const shoppingApi = {
  // Stores
  getStores: (hid: string) =>
    apiClient.get<Store[]>('/stores', cfg(hid)).then((r) => r.data),
  createStore: (hid: string, uid: string, data: object) =>
    apiClient.post<Store>('/stores', data, ctx(hid, uid)).then((r) => r.data),
  deleteStore: (id: string, hid: string) =>
    apiClient.delete(`/stores/${id}`, cfg(hid)),

  // Products
  getProducts: (hid: string, search?: string, storeId?: string) =>
    apiClient.get<Product[]>('/products', { ...cfg(hid), params: { search, storeId } }).then((r) => r.data),
  createProduct: (hid: string, uid: string, data: object) =>
    apiClient.post<Product>('/products', data, ctx(hid, uid)).then((r) => r.data),
  deleteProduct: (id: string, hid: string) =>
    apiClient.delete(`/products/${id}`, cfg(hid)),

  // Shopping lists
  getLists: (hid: string, status?: string) =>
    apiClient.get<ShoppingList[]>('/shopping-lists', { ...cfg(hid), params: status ? { status } : {} }).then((r) => r.data),
  getList: (id: string, hid: string) =>
    apiClient.get<ShoppingList>(`/shopping-lists/${id}`, cfg(hid)).then((r) => r.data),
  createList: (hid: string, uid: string, data: object) =>
    apiClient.post<ShoppingList>('/shopping-lists', data, ctx(hid, uid)).then((r) => r.data),
  updateList: (id: string, hid: string, data: object) =>
    apiClient.patch<ShoppingList>(`/shopping-lists/${id}`, data, cfg(hid)).then((r) => r.data),
  deleteList: (id: string, hid: string) =>
    apiClient.delete(`/shopping-lists/${id}`, cfg(hid)),
  completeList: (id: string, hid: string, uid: string) =>
    apiClient.post<ShoppingList>(`/shopping-lists/${id}/complete`, {}, ctx(hid, uid)).then((r) => r.data),

  // Items
  addItem: (listId: string, hid: string, uid: string, data: object) =>
    apiClient.post<ShoppingListItem>(`/shopping-lists/${listId}/items`, data, ctx(hid, uid)).then((r) => r.data),
  updateItem: (listId: string, itemId: string, hid: string, uid: string, data: object) =>
    apiClient
      .patch<ShoppingListItem>(`/shopping-lists/${listId}/items/${itemId}`, data, ctx(hid, uid))
      .then((r) => r.data),
  deleteItem: (listId: string, itemId: string, hid: string) =>
    apiClient.delete(`/shopping-lists/${listId}/items/${itemId}`, cfg(hid)),
};
