import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { Transaction } from '../types/api';
import type { TransactionFilters } from './useTransactionFilters';

/**
 * Fetches the household's transactions with the given filter shape. Keeps
 * the TanStack query key stable across renders (all filter fields are
 * primitives). Returns an empty array while loading so callers don't need
 * to unwrap Undefined.
 */
export function useTransactions(hid: string, filters: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', hid, filters.type, filters.accountId, filters.from, filters.to],
    queryFn: () =>
      financeApi.getTransactions(hid, {
        type: filters.type || undefined,
        accountId: filters.accountId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      }),
    enabled: !!hid,
    initialData: [] as Transaction[],
  });
}
