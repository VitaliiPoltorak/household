import { api } from './client';
import type {
  Account,
  AccountSummary,
  Transaction,
  Category,
  CategoryImpact,
  RecurringPayment,
  MonthlyReport,
  NetWorthReport,
  AccountTypeCatalogEntry,
  EnabledAccountType,
} from '../types/api';

const cfg = (hid: string) => ({ headers: { 'X-Household-Id': hid } });

export const financeApi = {
  // Accounts
  getAccounts: (hid: string) => api.get<Account[]>('/accounts', cfg(hid)),

  getSummary: (hid: string) =>
    api.get<AccountSummary>('/accounts/summary', cfg(hid)),

  createAccount: (
    hid: string,
    data: { name: string; type: string; currency?: string },
  ) => api.post<Account>('/accounts', data, cfg(hid)),

  updateAccount: (id: string, hid: string, data: object) =>
    api.patch<Account>(`/accounts/${id}`, data, cfg(hid)),

  archiveAccount: (id: string, hid: string) =>
    api.delete(`/accounts/${id}`, cfg(hid)),

  adjustBalance: (
    id: string,
    hid: string,
    data: { newBalance: number; description?: string; date?: string },
  ) => api.post<Transaction>(`/accounts/${id}/adjust-balance`, data, cfg(hid)),

  // Transactions
  getTransactions: (
    hid: string,
    params?: { type?: string; accountId?: string; from?: string; to?: string },
  ) => api.get<Transaction[]>('/transactions', { ...cfg(hid), params }),

  createTransaction: (hid: string, data: object) =>
    api.post<Transaction>('/transactions', data, cfg(hid)),

  createTransfer: (hid: string, data: CreateTransferPayload) =>
    api.post<[Transaction, Transaction]>(
      '/transactions/transfer',
      data,
      cfg(hid),
    ),

  updateTransaction: (id: string, hid: string, data: object) =>
    api.patch<Transaction>(`/transactions/${id}`, data, cfg(hid)),

  deleteTransaction: (id: string, hid: string) =>
    api.delete(`/transactions/${id}`, cfg(hid)),

  // Categories
  getCategories: (
    hid: string,
    type?: 'income' | 'expense',
    includeArchived = false,
  ) =>
    api.get<Category[]>('/categories', {
      ...cfg(hid),
      params: {
        ...(type ? { type } : {}),
        ...(includeArchived ? { includeArchived: 'true' } : {}),
      },
    }),

  createCategory: (hid: string, data: object) =>
    api.post<Category>('/categories', data, cfg(hid)),

  // Archives the category (backend #111). Response stays 204.
  deleteCategory: (id: string, hid: string) =>
    api.delete(`/categories/${id}`, cfg(hid)),

  // Restores an archived category (backend #111).
  unarchiveCategory: (id: string, hid: string) =>
    api.post<Category>(`/categories/${id}/unarchive`, {}, cfg(hid)),

  // Reference-count preview used before permanent-delete (backend #112).
  getCategoryImpact: (id: string, hid: string) =>
    api.get<CategoryImpact>(`/categories/${id}/impact`, cfg(hid)),

  // Hard-deletes only when impact == 0; returns 409 + impact body otherwise (backend #113).
  permanentlyDeleteCategory: (id: string, hid: string) =>
    api.delete(`/categories/${id}?permanent=true`, cfg(hid)),

  // Recurring payments
  getRecurringPayments: (hid: string) =>
    api.get<RecurringPayment[]>('/recurring-payments', cfg(hid)),

  getUpcoming: (hid: string, days = 30) =>
    api.get<RecurringPayment[]>('/recurring-payments/upcoming', {
      ...cfg(hid),
      params: { days },
    }),

  createRecurringPayment: (hid: string, data: object) =>
    api.post<RecurringPayment>('/recurring-payments', data, cfg(hid)),

  deleteRecurringPayment: (id: string, hid: string) =>
    api.delete(`/recurring-payments/${id}`, cfg(hid)),

  // Reports
  getMonthlyReport: (hid: string, year: number, month: number) =>
    api.get<MonthlyReport>('/reports/monthly', {
      ...cfg(hid),
      params: { year, month },
    }),

  getNetWorth: (hid: string) =>
    api.get<NetWorthReport>('/reports/net-worth', cfg(hid)),

  // Account types (#227)
  getAccountTypes: () => api.get<AccountTypeCatalogEntry[]>('/account-types'),

  getEnabledAccountTypes: (hid: string) =>
    api.get<EnabledAccountType[]>('/account-types/enabled', cfg(hid)),

  // `code` reuses an existing catalog entry; pass `label` (+ optional `icon`)
  // to coin a brand-new one when `code` doesn't already exist.
  enableAccountType: (
    hid: string,
    data: { code: string; label?: string; icon?: string },
  ) => api.post<EnabledAccountType>('/account-types/enabled', data, cfg(hid)),

  // Exchange rates (household-agnostic — no cfg needed but header is harmless)
  getLatestRates: () => api.get<ExchangeRate[]>('/rates/latest'),

  // On-demand refresh. Server-side rate limit: 1 request per minute per user.
  // Returns the freshly-synced rates so callers don't need a follow-up GET.
  refreshRates: () => api.post<RefreshRatesResponse>('/rates/refresh'),
};

/**
 * Request shape for POST /transactions/transfer.
 *
 * Cross-currency (#162): pass `fromAmount` + `toAmount` (with `toCurrency`
 * when it differs from `currency`). Same-currency callers may still pass
 * the legacy `amount` shape — the backend accepts either but not both.
 * Mixing the two produces a 400.
 */
export interface CreateTransferPayload {
  fromAccountId: string;
  toAccountId: string;
  /** Legacy same-currency shortcut. Prefer fromAmount + toAmount. */
  amount?: number;
  /** Amount debited from the source account, denominated in `currency`. */
  fromAmount?: number;
  /** Amount credited to the destination account, denominated in `toCurrency`. */
  toAmount?: number;
  /** Source currency. Defaults to UAH server-side. */
  currency?: string;
  /** Destination currency. Omit for same-currency transfers. */
  toCurrency?: string;
  description?: string;
  date: string;
}

export interface ExchangeRate {
  ccy: string;
  base_ccy: string;
  buy: string;
  sale: string;
  effective_date: string;
  source: string;
}

export interface RefreshRatesResponse {
  inserted: number;
  date: string;
  rates: ExchangeRate[];
}
