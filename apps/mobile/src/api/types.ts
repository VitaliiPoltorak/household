/** Mobile token delivery (#356): refresh material arrives in the body. */
export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  sessionId: string;
  refreshToken: string;
}

export interface RegisterResponse {
  userId: string;
  email: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

/** Machine-readable `code` the auth endpoints put on 4xx bodies (see apps/web/src/types/api.ts). */
export type AuthErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'CODE_INVALID'
  | 'CODE_ATTEMPTS_EXHAUSTED'
  | 'CODE_EXPIRED_OR_MISSING'
  | 'WEAK_PASSWORD'
  | 'PASSWORD_PWNED';

export interface Household {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
}

// Open-ended (#227): validated server-side against the household's enabled types.
export type AccountType = string;

export interface Account {
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  currency: string;
  // Decimal columns can arrive as strings; always go through Number().
  balance: number | string;
  isArchived: boolean;
  allowsNegativeBalance: boolean;
}

export interface EnabledAccountType {
  id: string;
  householdId: string;
  typeCode: string;
  accountType: { code: string; label: string; icon: string | null };
}
