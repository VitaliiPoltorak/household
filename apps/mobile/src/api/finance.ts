import { api, householdHeaders } from './client';
import type { Account, EnabledAccountType } from './types';

export interface CreateAccountInput {
  name: string;
  type: string;
  currency?: string;
  // Omitted (not 0) when blank so the server defaults apply (#326).
  initialBalance?: number;
  allowsNegativeBalance?: boolean;
}

export type UpdateAccountInput = Partial<
  Omit<CreateAccountInput, 'initialBalance'>
>;

export const financeApi = {
  getAccounts: (hid: string) =>
    api.get<Account[]>('/accounts', { headers: householdHeaders(hid) }),

  createAccount: (hid: string, data: CreateAccountInput) =>
    api.post<Account>('/accounts', data, { headers: householdHeaders(hid) }),

  updateAccount: (id: string, hid: string, data: UpdateAccountInput) =>
    api.patch<Account>(`/accounts/${id}`, data, {
      headers: householdHeaders(hid),
    }),

  // Soft delete: the account is archived, its transactions are kept.
  archiveAccount: (id: string, hid: string) =>
    api.delete(`/accounts/${id}`, { headers: householdHeaders(hid) }),

  getEnabledAccountTypes: (hid: string) =>
    api.get<EnabledAccountType[]>('/account-types/enabled', {
      headers: householdHeaders(hid),
    }),
};
