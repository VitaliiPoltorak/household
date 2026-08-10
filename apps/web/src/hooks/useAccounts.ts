import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { Account } from '../types/api';

/** Household's non-archived accounts. Empty array while loading. */
export function useAccounts(hid: string) {
  return useQuery({
    queryKey: ['accounts', hid],
    queryFn: () => financeApi.getAccounts(hid),
    enabled: !!hid,
    initialData: [] as Account[],
  });
}
