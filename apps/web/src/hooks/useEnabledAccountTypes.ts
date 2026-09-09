import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../api/finance';
import type { EnabledAccountType } from '../types/api';

/**
 * The household's enabled account types — the source that turns a stored code
 * ("bank") into something a person should read ("Bank").
 *
 * Extracted from AccountsPage when the dashboard needed the same list (#332).
 */
export function useEnabledAccountTypes(hid: string | undefined) {
  return useQuery<EnabledAccountType[]>({
    queryKey: ['account-types-enabled', hid],
    queryFn: () => financeApi.getEnabledAccountTypes(hid!),
    enabled: !!hid,
  });
}
