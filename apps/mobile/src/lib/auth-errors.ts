import { ApiError } from '../api/client';
import type { AuthErrorCode } from '../api/types';

export interface MappedAuthError {
  message: string;
  code?: AuthErrorCode;
  /** Echoed by the server on EMAIL_NOT_VERIFIED so the verify screen can prefill. */
  email?: string;
}

/** Translate an auth ApiError into user-facing copy (English until mobile i18n lands). */
export function mapAuthError(err: unknown): MappedAuthError {
  if (!(err instanceof ApiError)) {
    return { message: 'Could not reach the server. Check your connection.' };
  }
  const data = err.data;
  const code =
    typeof data['code'] === 'string'
      ? (data['code'] as AuthErrorCode)
      : undefined;
  switch (code) {
    case 'EMAIL_NOT_VERIFIED':
      return {
        code,
        message: 'Please verify your email first.',
        email: typeof data['email'] === 'string' ? data['email'] : undefined,
      };
    case 'ACCOUNT_LOCKED':
      return {
        code,
        message:
          'Too many failed attempts. Check your email for an unlock link.',
      };
    case 'CODE_INVALID': {
      const left = data['attemptsRemaining'];
      return {
        code,
        message:
          typeof left === 'number'
            ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`
            : 'Incorrect code.',
      };
    }
    case 'CODE_ATTEMPTS_EXHAUSTED':
      return { code, message: 'Too many wrong codes. Request a new one.' };
    case 'CODE_EXPIRED_OR_MISSING':
      return { code, message: 'That code has expired. Request a new one.' };
    case 'WEAK_PASSWORD':
      return { code, message: 'That password is too easy to guess.' };
    case 'PASSWORD_PWNED':
      return {
        code,
        message: 'That password appeared in a data breach. Pick another.',
      };
  }
  if (err.status === 401) return { message: 'Incorrect email or password.' };
  if (err.status === 429)
    return { message: 'Too many attempts. Try again later.' };
  return { message: 'Something went wrong. Please try again.' };
}
