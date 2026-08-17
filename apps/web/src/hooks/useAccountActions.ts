import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { Account } from '../types/api';

export type QuickTxType = 'income' | 'expense' | 'transfer';

/**
 * Shared mutation + modal-state layer for the Accounts page. Extracted so
 * both the grid (`AccountCard`) and the list (`AccountRow`) views drive the
 * exact same handlers and see the same modals — grid vs list can't drift
 * apart in what actions they expose or how they invalidate caches (#164).
 */
export function useAccountActions(hid: string) {
  const qc = useQueryClient();

  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [quickTx, setQuickTx] = useState<{ account: Account; type: QuickTxType } | null>(null);
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);

  const archive = useMutation({
    mutationFn: (id: string) => financeApi.archiveAccount(id, hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', hid] }),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      financeApi.updateAccount(id, hid, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', hid] });
      // Currency changes affect transaction display totals; refresh both
      // lists in case the edit modal touched currency too.
      qc.invalidateQueries({ queryKey: ['transactions', hid] });
    },
  });

  return {
    modals: { editAccount, quickTx, adjustAccount },
    closeEdit: () => setEditAccount(null),
    closeQuickTx: () => setQuickTx(null),
    closeAdjust: () => setAdjustAccount(null),
    // Handler bundle passed identically to AccountCard + AccountRow.
    handlers: {
      onArchive: (a: Account) => archive.mutate(a.id),
      onEdit: (a: Account) => setEditAccount(a),
      onNameSave: (a: Account, name: string) => rename.mutate({ id: a.id, name }),
      onQuickTx: (a: Account, type: QuickTxType) => setQuickTx({ account: a, type }),
      onAdjust: (a: Account) => setAdjustAccount(a),
    },
  };
}
