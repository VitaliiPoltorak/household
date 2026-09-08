import { ApiError } from '../api/client';
import type { FinanceErrorCode } from '../types/api';

export interface InsufficientFunds {
  code: Extract<FinanceErrorCode, 'INSUFFICIENT_FUNDS'>;
  /** What the account actually holds, in its own currency. */
  available: number;
  /** What the refused withdrawal asked for. */
  requested: number;
  currency: string;
  accountId: string;
}

/**
 * Recognise the withdrawal guard's 409 (#326) and pull out the numbers needed
 * to say something useful against the amount field.
 *
 * Returns null for anything else, so callers keep their existing generic
 * error path — this narrows one specific failure, it does not replace error
 * handling.
 *
 * Deliberately branches on the `code` the server sends rather than the HTTP
 * status: 409 also covers duplicate account names, and those must not render
 * as "insufficient funds" against the amount.
 */
export function asInsufficientFunds(err: unknown): InsufficientFunds | null {
  if (!(err instanceof ApiError)) return null;
  const data = err.data as Record<string, unknown>;
  if (data['code'] !== 'INSUFFICIENT_FUNDS') return null;
  if (typeof data['available'] !== 'number') return null;
  return {
    code: 'INSUFFICIENT_FUNDS',
    available: data['available'],
    requested: typeof data['requested'] === 'number' ? data['requested'] : 0,
    currency: typeof data['currency'] === 'string' ? data['currency'] : '',
    accountId: typeof data['accountId'] === 'string' ? data['accountId'] : '',
  };
}
