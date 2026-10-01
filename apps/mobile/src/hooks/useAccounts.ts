import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { CreateAccountInput, UpdateAccountInput } from '../api/finance';

// Query keys match apps/web so the realtime bridge (#367) can invalidate both alike.
export function useAccounts(hid: string | undefined) {
  return useQuery({
    queryKey: ['accounts', hid],
    queryFn: () => financeApi.getAccounts(hid!),
    enabled: !!hid,
  });
}

export function useEnabledAccountTypes(hid: string | undefined) {
  return useQuery({
    queryKey: ['account-types-enabled', hid],
    queryFn: () => financeApi.getEnabledAccountTypes(hid!),
    enabled: !!hid,
  });
}

export function useAccountMutations(hid: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['accounts', hid] });
    // Currency/archive changes alter transaction display and totals.
    void qc.invalidateQueries({ queryKey: ['transactions', hid] });
  };
  return {
    create: useMutation({
      mutationFn: (data: CreateAccountInput) =>
        financeApi.createAccount(hid, data),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateAccountInput }) =>
        financeApi.updateAccount(id, hid, data),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (id: string) => financeApi.archiveAccount(id, hid),
      onSuccess: refresh,
    }),
  };
}
