import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { Category } from '../types/api';

/** Household's non-archived categories. Empty array while loading. */
export function useCategories(hid: string) {
  return useQuery({
    queryKey: ['categories', hid],
    queryFn: () => financeApi.getCategories(hid),
    enabled: !!hid,
    initialData: [] as Category[],
    initialDataUpdatedAt: 0,
  });
}
