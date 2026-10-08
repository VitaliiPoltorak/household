import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '../api/finance';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../api/finance';

// Same key shape as apps/web's CategoriesPage. Everything lives under
// ['categories', hid], so one invalidation also refreshes the active-only
// list that the transaction forms read (useCategories).
export function useAllCategories(hid: string | undefined) {
  return useQuery({
    queryKey: ['categories', hid, { includeArchived: true }],
    queryFn: () => categoriesApi.list(hid!, true),
    enabled: !!hid,
  });
}

export function useCategoryImpact(id: string, hid: string, enabled: boolean) {
  return useQuery({
    queryKey: ['categoryImpact', id, hid],
    queryFn: () => categoriesApi.impact(id, hid),
    enabled,
    // Another member may add a transaction at any time; always re-check.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCategoryMutations(hid: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['categories', hid] });
  };
  return {
    create: useMutation({
      mutationFn: (data: CreateCategoryInput) =>
        categoriesApi.create(hid, data),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateCategoryInput }) =>
        categoriesApi.update(id, hid, data),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (id: string) => categoriesApi.archive(id, hid),
      onSuccess: refresh,
    }),
    unarchive: useMutation({
      mutationFn: (id: string) => categoriesApi.unarchive(id, hid),
      onSuccess: refresh,
    }),
    permanentDelete: useMutation({
      mutationFn: (id: string) => categoriesApi.permanentDelete(id, hid),
      onSuccess: refresh,
    }),
  };
}
