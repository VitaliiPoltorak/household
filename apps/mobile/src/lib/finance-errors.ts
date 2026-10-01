import { ApiError } from '../api/client';

/** User-facing copy for finance-service failures (English until mobile i18n lands). */
export function financeErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Could not reach the server. Check your connection.';
  }
  if (err.status === 403) return "You don't have permission to do that.";
  if (err.status === 404) return 'That account no longer exists.';
  // 400s carry the validator's own message (e.g. a disabled account type).
  if (err.status === 400 && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
