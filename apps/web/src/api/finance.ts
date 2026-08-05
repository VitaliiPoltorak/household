import { apiClient } from './client';
import type {
  Account, AccountSummary, Transaction, Category, RecurringPayment,
  MonthlyReport, NetWorthReport,
} from '../types/api';

const cfg = (householdId: string) => ({ headers: { 'X-Household-Id': householdId } });

export const financeApi = {
  // Accounts
  getAccounts: (hid: string) =>
    apiClient.get<Account[]>('/accounts', cfg(hid)).then((r) => r.data),
  getSummary: (hid: string) =>
    apiClient.get<AccountSummary>('/accounts/summary', cfg(hid)).then((r) => r.data),
  createAccount: (hid: string, data: { name: string; type: string; currency?: string }) =>
    apiClient.post<Account>('/accounts', data, cfg(hid)).then((r) => r.data),
  updateAccount: (id: string, hid: string, data: object) =>
    apiClient.patch<Account>(`/accounts/${id}`, data, cfg(hid)).then((r) => r.data),
  archiveAccount: (id: string, hid: string) =>
    apiClient.delete(`/accounts/${id}`, cfg(hid)),

  // Transactions
  getTransactions: (hid: string, params?: { type?: string; accountId?: string; from?: string; to?: string }) =>
    apiClient.get<Transaction[]>('/transactions', { ...cfg(hid), params }).then((r) => r.data),
  createTransaction: (hid: string, data: object) =>
    apiClient.post<Transaction>('/transactions', data, cfg(hid)).then((r) => r.data),
  createTransfer: (hid: string, data: object) =>
    apiClient.post<[Transaction, Transaction]>('/transactions/transfer', data, cfg(hid)).then((r) => r.data),
  updateTransaction: (id: string, hid: string, data: object) =>
    apiClient.patch<Transaction>(`/transactions/${id}`, data, cfg(hid)).then((r) => r.data),
  deleteTransaction: (id: string, hid: string) =>
    apiClient.delete(`/transactions/${id}`, cfg(hid)),

  // Categories
  getCategories: (hid: string, type?: 'income' | 'expense') =>
    apiClient.get<Category[]>('/categories', { ...cfg(hid), params: type ? { type } : {} }).then((r) => r.data),
  createCategory: (hid: string, data: object) =>
    apiClient.post<Category>('/categories', data, cfg(hid)).then((r) => r.data),
  deleteCategory: (id: string, hid: string) =>
    apiClient.delete(`/categories/${id}`, cfg(hid)),

  // Recurring payments
  getRecurringPayments: (hid: string) =>
    apiClient.get<RecurringPayment[]>('/recurring-payments', cfg(hid)).then((r) => r.data),
  getUpcoming: (hid: string, days = 30) =>
    apiClient.get<RecurringPayment[]>('/recurring-payments/upcoming', { ...cfg(hid), params: { days } }).then((r) => r.data),
  createRecurringPayment: (hid: string, data: object) =>
    apiClient.post<RecurringPayment>('/recurring-payments', data, cfg(hid)).then((r) => r.data),
  deleteRecurringPayment: (id: string, hid: string) =>
    apiClient.delete(`/recurring-payments/${id}`, cfg(hid)),

  // Reports
  getMonthlyReport: (hid: string, year: number, month: number) =>
    apiClient.get<MonthlyReport>('/reports/monthly', { ...cfg(hid), params: { year, month } }).then((r) => r.data),
  getNetWorth: (hid: string) =>
    apiClient.get<NetWorthReport>('/reports/net-worth', cfg(hid)).then((r) => r.data),
};
