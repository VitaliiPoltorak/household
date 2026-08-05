import { api } from './client';
import type {
  Account, AccountSummary, Transaction, Category, RecurringPayment,
  MonthlyReport, NetWorthReport,
} from '../types/api';

const cfg = (hid: string) => ({ headers: { 'X-Household-Id': hid } });

export const financeApi = {
  // Accounts
  getAccounts: (hid: string) => api.get<Account[]>('/accounts', cfg(hid)),

  getSummary: (hid: string) => api.get<AccountSummary>('/accounts/summary', cfg(hid)),

  createAccount: (hid: string, data: { name: string; type: string; currency?: string }) =>
    api.post<Account>('/accounts', data, cfg(hid)),

  updateAccount: (id: string, hid: string, data: object) =>
    api.patch<Account>(`/accounts/${id}`, data, cfg(hid)),

  archiveAccount: (id: string, hid: string) =>
    api.delete(`/accounts/${id}`, cfg(hid)),

  // Transactions
  getTransactions: (hid: string, params?: { type?: string; accountId?: string; from?: string; to?: string }) =>
    api.get<Transaction[]>('/transactions', { ...cfg(hid), params }),

  createTransaction: (hid: string, data: object) =>
    api.post<Transaction>('/transactions', data, cfg(hid)),

  createTransfer: (hid: string, data: object) =>
    api.post<[Transaction, Transaction]>('/transactions/transfer', data, cfg(hid)),

  updateTransaction: (id: string, hid: string, data: object) =>
    api.patch<Transaction>(`/transactions/${id}`, data, cfg(hid)),

  deleteTransaction: (id: string, hid: string) =>
    api.delete(`/transactions/${id}`, cfg(hid)),

  // Categories
  getCategories: (hid: string, type?: 'income' | 'expense') =>
    api.get<Category[]>('/categories', { ...cfg(hid), params: type ? { type } : undefined }),

  createCategory: (hid: string, data: object) =>
    api.post<Category>('/categories', data, cfg(hid)),

  deleteCategory: (id: string, hid: string) =>
    api.delete(`/categories/${id}`, cfg(hid)),

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
    api.get<MonthlyReport>('/reports/monthly', { ...cfg(hid), params: { year, month } }),

  getNetWorth: (hid: string) =>
    api.get<NetWorthReport>('/reports/net-worth', cfg(hid)),
};
