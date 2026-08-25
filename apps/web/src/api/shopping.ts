import { api } from './client';
import type { Store, StoreImpact, Product, ShoppingList, ShoppingListItem } from '../types/api';

const cfg = (hid: string) => ({ headers: { 'X-Household-Id': hid } });
const ctx = (hid: string, uid: string) => ({
  headers: { 'X-Household-Id': hid, 'X-User-Id': uid },
});

export const shoppingApi = {
  // Stores
  getStores: (hid: string) => api.get<Store[]>('/stores', cfg(hid)),

  createStore: (hid: string, uid: string, data: object) =>
    api.post<Store>('/stores', data, ctx(hid, uid)),

  updateStore: (id: string, hid: string, data: object) =>
    api.patch<Store>(`/stores/${id}`, data, cfg(hid)),

  deleteStore: (id: string, hid: string) => api.delete(`/stores/${id}`, cfg(hid)),

  getStoreImpact: (id: string, hid: string) =>
    api.get<StoreImpact>(`/stores/${id}/impact`, cfg(hid)),

  // Products
  getProducts: (hid: string, search?: string, storeId?: string) =>
    api.get<Product[]>('/products', { ...cfg(hid), params: { search, storeId } }),

  createProduct: (hid: string, uid: string, data: object) =>
    api.post<Product>('/products', data, ctx(hid, uid)),

  updateProduct: (id: string, hid: string, data: object) =>
    api.patch<Product>(`/products/${id}`, data, cfg(hid)),

  deleteProduct: (id: string, hid: string) => api.delete(`/products/${id}`, cfg(hid)),

  // Shopping lists
  getLists: (hid: string, status?: string) =>
    api.get<ShoppingList[]>('/shopping-lists', { ...cfg(hid), params: status ? { status } : undefined }),

  getList: (id: string, hid: string) =>
    api.get<ShoppingList>(`/shopping-lists/${id}`, cfg(hid)),

  createList: (hid: string, uid: string, data: object) =>
    api.post<ShoppingList>('/shopping-lists', data, ctx(hid, uid)),

  updateList: (id: string, hid: string, data: object) =>
    api.patch<ShoppingList>(`/shopping-lists/${id}`, data, cfg(hid)),

  deleteList: (id: string, hid: string) =>
    api.delete(`/shopping-lists/${id}`, cfg(hid)),

  completeList: (id: string, hid: string, uid: string) =>
    api.post<ShoppingList>(`/shopping-lists/${id}/complete`, {}, ctx(hid, uid)),

  // Items
  addItem: (listId: string, hid: string, uid: string, data: object) =>
    api.post<ShoppingListItem>(`/shopping-lists/${listId}/items`, data, ctx(hid, uid)),

  updateItem: (listId: string, itemId: string, hid: string, uid: string, data: object) =>
    api.patch<ShoppingListItem>(`/shopping-lists/${listId}/items/${itemId}`, data, ctx(hid, uid)),

  deleteItem: (listId: string, itemId: string, hid: string) =>
    api.delete(`/shopping-lists/${listId}/items/${itemId}`, cfg(hid)),
};
