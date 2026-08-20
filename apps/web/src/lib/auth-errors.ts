import { ApiError } from '../api/client';
import type { AuthErrorCode } from '../types/api';

export interface MappedAuthError {
  /** i18n key inside the auth.errors.* namespace. */
  key: string;
  /** Machine-readable code the server sent, if any — for callers that need to branch (redirect / route). */
  code?: AuthErrorCode;
  /** zxcvbn suggestions to render as a hint list on WEAK_PASSWORD. */
  suggestions?: string[];
  /** Attempts remaining after a wrong verification code. */
  attemptsRemaining?: number;
  /** Email the server echoed back on EMAIL_NOT_VERIFIED so we can prefill the verify screen. */
  email?: string;
}

/**
 * Translate an ApiError into a stable i18n key + structured extras. Kept
 * exhaustive over AuthErrorCode so a new backend code is a TypeScript error
 * here, not a silent "auth.errors.unknown" in prod.
 *
 * The keys returned are namespaced under auth.errors.* — every locale must
 * define them. See libs/locales/src/en.json for the reference set.
 */
export function mapAuthError(err: unknown): MappedAuthError {
  if (!(err instanceof ApiError)) {
    return { key: 'auth.errors.unknown' };
  }

  const data = err.data as Record<string, unknown>;
  const code = typeof data['code'] === 'string' ? (data['code'] as AuthErrorCode) : undefined;

  // Prefer the machine-readable code over HTTP status where it exists — same
  // 400 covers a dozen different failure modes and each maps to a different
  // user-facing message.
  if (code) {
    switch (code) {
      case 'EMAIL_NOT_VERIFIED':
        return {
          key: 'auth.errors.emailNotVerified',
          code,
          email: typeof data['email'] === 'string' ? (data['email'] as string) : undefined,
        };
      case 'ACCOUNT_LOCKED':
        return { key: 'auth.errors.accountLocked', code };
      case 'INVALID_UNLOCK_TOKEN':
        return { key: 'auth.errors.invalidUnlockToken', code };
      case 'CODE_INVALID':
        return {
          key: 'auth.errors.codeInvalid',
          code,
          attemptsRemaining:
            typeof data['attemptsRemaining'] === 'number'
              ? (data['attemptsRemaining'] as number)
              : undefined,
        };
      case 'CODE_ATTEMPTS_EXHAUSTED':
        return { key: 'auth.errors.codeExhausted', code };
      case 'CODE_EXPIRED_OR_MISSING':
        return { key: 'auth.errors.codeExpired', code };
      case 'WEAK_PASSWORD':
        return {
          key: 'auth.errors.weakPassword',
          code,
          suggestions: Array.isArray(data['suggestions'])
            ? (data['suggestions'] as string[])
            : undefined,
        };
      case 'PASSWORD_PWNED':
        return { key: 'auth.errors.passwordPwned', code };
      case 'SAME_PASSWORD':
        return { key: 'auth.errors.samePassword', code };
      case 'NO_PASSWORD_SET':
        return { key: 'auth.errors.noPasswordSet', code };
    }
  }

  // No structured code — fall back to HTTP status.
  switch (err.status) {
    case 401:
      return { key: 'auth.errors.invalidCredentials' };
    case 409:
      return { key: 'auth.errors.emailTaken' };
    case 429:
      return { key: 'auth.errors.tooManyRequests' };
    default:
      return { key: 'auth.errors.unknown' };
  }
}
