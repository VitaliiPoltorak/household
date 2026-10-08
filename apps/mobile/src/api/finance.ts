import { api, householdHeaders } from './client';
import type {
  Account,
  Category,
  CategoryImpact,
  EnabledAccountType,
  ExchangeRate,
  Transaction,
} from './types';

export interface CreateAccountInput {
  name: string;
  type: string;
  currency?: string;
  // Omitted (not 0) when blank so the server defaults apply (#326).
  initialBalance?: number;
  allowsNegativeBalance?: boolean;
}

export type UpdateAccountInput = Partial<
  Omit<CreateAccountInput, 'initialBalance'>
>;

export const financeApi = {
  getAccounts: (hid: string) =>
    api.get<Account[]>('/accounts', { headers: householdHeaders(hid) }),

  createAccount: (hid: string, data: CreateAccountInput) =>
    api.post<Account>('/accounts', data, { headers: householdHeaders(hid) }),

  updateAccount: (id: string, hid: string, data: UpdateAccountInput) =>
    api.patch<Account>(`/accounts/${id}`, data, {
      headers: householdHeaders(hid),
    }),

  // Soft delete: the account is archived, its transactions are kept.
  archiveAccount: (id: string, hid: string) =>
    api.delete(`/accounts/${id}`, { headers: householdHeaders(hid) }),

  getEnabledAccountTypes: (hid: string) =>
    api.get<EnabledAccountType[]>('/account-types/enabled', {
      headers: householdHeaders(hid),
    }),
};

export interface CreateCategoryInput {
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  parentId?: string;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export const categoriesApi = {
  // Archived rows come back only on request; the screen filters them locally.
  list: (hid: string, includeArchived: boolean) =>
    api.get<Category[]>('/categories', {
      headers: householdHeaders(hid),
      params: includeArchived ? { includeArchived: 'true' } : {},
    }),

  create: (hid: string, data: CreateCategoryInput) =>
    api.post<Category>('/categories', data, { headers: householdHeaders(hid) }),

  update: (id: string, hid: string, data: UpdateCategoryInput) =>
    api.patch<Category>(`/categories/${id}`, data, {
      headers: householdHeaders(hid),
    }),

  // Soft delete: the category is archived and can be restored.
  archive: (id: string, hid: string) =>
    api.delete(`/categories/${id}`, { headers: householdHeaders(hid) }),

  unarchive: (id: string, hid: string) =>
    api.post<Category>(
      `/categories/${id}/unarchive`,
      {},
      { headers: householdHeaders(hid) },
    ),

  impact: (id: string, hid: string) =>
    api.get<CategoryImpact>(`/categories/${id}/impact`, {
      headers: householdHeaders(hid),
    }),

  // 409 with an `impact` body when dependents still exist.
  permanentDelete: (id: string, hid: string) =>
    api.delete(`/categories/${id}?permanent=true`, {
      headers: householdHeaders(hid),
    }),
};

export interface TransactionFilters {
  type?: string;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export interface CreateTransactionInput {
  accountId: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  categoryId?: string;
  description?: string;
  date: string;
}

export interface UpdateTransactionInput {
  // Omitted for transfer legs: the server rejects a type change on them.
  type?: 'income' | 'expense' | 'adjustment';
  amount?: number;
  categoryId?: string;
  description?: string;
  date?: string;
}

/** POST /transactions/transfer — see CreateTransferDto (#162). */
export interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  currency: string;
  /** Only for cross-currency transfers. */
  toCurrency?: string;
  description?: string;
  date: string;
}

export const transactionsApi = {
  list: (hid: string, params: TransactionFilters) =>
    api.get<Transaction[]>('/transactions', {
      headers: householdHeaders(hid),
      params: { ...params },
    }),

  get: (id: string, hid: string) =>
    api.get<Transaction>(`/transactions/${id}`, {
      headers: householdHeaders(hid),
    }),

  create: (hid: string, data: CreateTransactionInput) =>
    api.post<Transaction>('/transactions', data, {
      headers: householdHeaders(hid),
    }),

  createTransfer: (hid: string, data: CreateTransferInput) =>
    api.post<[Transaction, Transaction]>('/transactions/transfer', data, {
      headers: householdHeaders(hid),
    }),

  update: (id: string, hid: string, data: UpdateTransactionInput) =>
    api.patch<Transaction>(`/transactions/${id}`, data, {
      headers: householdHeaders(hid),
    }),

  // Deleting either leg of a transfer removes the pair and reverses both balances.
  remove: (id: string, hid: string) =>
    api.delete(`/transactions/${id}`, { headers: householdHeaders(hid) }),

  categories: (hid: string) =>
    api.get<Category[]>('/categories', { headers: householdHeaders(hid) }),

  latestRates: () => api.get<ExchangeRate[]>('/rates/latest'),
};
