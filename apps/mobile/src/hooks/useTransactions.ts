import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { transactionsApi } from '../api/finance';
import type {
  CreateTransactionInput,
  CreateTransferInput,
  TransactionFilters,
  UpdateTransactionInput,
} from '../api/finance';
import { ratesFromRows } from '../lib/currency';

export function useTransactions(
  hid: string | undefined,
  f: TransactionFilters,
) {
  return useQuery({
    // Primitive filter fields only, same key shape as apps/web.
    queryKey: [
      'transactions',
      hid,
      f.type,
      f.accountId,
      f.categoryId,
      f.from,
      f.to,
    ],
    queryFn: () =>
      transactionsApi.list(hid!, {
        type: f.type || undefined,
        accountId: f.accountId || undefined,
        categoryId: f.categoryId || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      }),
    enabled: !!hid,
  });
}

export function useTransaction(hid: string | undefined, id: string) {
  return useQuery({
    // Nested under ['transactions', hid] so list invalidation refreshes it too.
    queryKey: ['transactions', hid, 'detail', id],
    queryFn: () => transactionsApi.get(id, hid!),
    enabled: !!hid,
  });
}

export function useCategories(hid: string | undefined) {
  return useQuery({
    queryKey: ['categories', hid],
    queryFn: () => transactionsApi.categories(hid!),
    enabled: !!hid,
  });
}

/** Market rates, fetched only when a cross-currency transfer needs them. */
export function useRates(needed: boolean) {
  return useQuery({
    queryKey: ['exchange-rates'],
    queryFn: transactionsApi.latestRates,
    enabled: needed,
    staleTime: 30 * 60 * 1000,
    retry: 1,
    select: ratesFromRows,
  });
}

export function useTransactionMutations(hid: string) {
  const qc = useQueryClient();
  // Every money movement changes balances, so accounts are refreshed too.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['transactions', hid] });
    void qc.invalidateQueries({ queryKey: ['accounts', hid] });
  };
  return {
    create: useMutation({
      mutationFn: (d: CreateTransactionInput) => transactionsApi.create(hid, d),
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: (d: CreateTransferInput) =>
        transactionsApi.createTransfer(hid, d),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        data,
      }: {
        id: string;
        data: UpdateTransactionInput;
      }) => transactionsApi.update(id, hid, data),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => transactionsApi.remove(id, hid),
      onSuccess: refresh,
    }),
  };
}
