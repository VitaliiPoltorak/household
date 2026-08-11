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
    // initialData gives us a never-undefined `data`, but pairing it with
    // initialDataUpdatedAt: 0 keeps the seed value flagged as stale so the
    // 30s global staleTime doesn't gate the first fetch (without this, the
    // page shows an empty list for 30s+ before the query actually runs).
    initialData: [] as Transaction[],
    initialDataUpdatedAt: 0,
  });
}
