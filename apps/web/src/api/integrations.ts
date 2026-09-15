import { api } from './client';
import type { BankAccount, BankConnection, BankSyncLog } from '../types/api';

const cfg = (hid: string) => ({ headers: { 'X-Household-Id': hid } });

export const integrationsApi = {
  connectMonobank: (hid: string, token: string) =>
    api.post<BankConnection>(
      '/integrations/monobank/connect',
      { token },
      cfg(hid),
    ),

  getConnections: (hid: string) =>
    api.get<BankConnection[]>('/integrations/monobank/connections', cfg(hid)),

  disconnect: (id: string, hid: string) =>
    api.delete(`/integrations/monobank/connections/${id}`, cfg(hid)),

  // Accepted, not finished (#293) — returns the queued run; poll getLogs (or
  // getConnections while a run is active) for progress.
  sync: (id: string, hid: string) =>
    api.post<BankSyncLog>(
      `/integrations/monobank/connections/${id}/sync`,
      undefined,
      cfg(hid),
    ),

  setAccountSyncEnabled: (
    connectionId: string,
    accountId: string,
    hid: string,
    enabled: boolean,
  ) =>
    api.patch<BankAccount>(
      `/integrations/monobank/connections/${connectionId}/accounts/${accountId}`,
      { enabled },
      cfg(hid),
    ),

  getLogs: (id: string, hid: string) =>
    api.get<BankSyncLog[]>(
      `/integrations/monobank/connections/${id}/logs`,
      cfg(hid),
    ),
};
