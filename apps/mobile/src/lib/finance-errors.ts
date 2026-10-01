import { ApiError } from '../api/errors';

export interface InsufficientFunds {
  /** What the account actually holds, in its own currency. */
  available: number;
  currency: string;
}

/**
 * Recognise the withdrawal guard's 409 (#326). Branches on the `code` the
 * server sends, not the status: 409 also covers duplicate account names.
 */
export function asInsufficientFunds(err: unknown): InsufficientFunds | null {
  if (!(err instanceof ApiError)) return null;
  if (err.data['code'] !== 'INSUFFICIENT_FUNDS') return null;
  if (typeof err.data['available'] !== 'number') return null;
  return {
    available: err.data['available'],
    currency:
      typeof err.data['currency'] === 'string' ? err.data['currency'] : '',
  };
}

/** User-facing copy for finance-service failures (English until mobile i18n lands). */
export function financeErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Could not reach the server. Check your connection.';
  }
  const funds = asInsufficientFunds(err);
  if (funds) {
    return `Insufficient funds: the account holds ${funds.available} ${funds.currency}.`;
  }
  if (err.status === 403) return "You don't have permission to do that.";
  if (err.status === 404) return 'That item no longer exists.';
  // 400s carry the validator's own message (e.g. a disabled account type).
  if (err.status === 400 && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
