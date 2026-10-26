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

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';
export type TransferDirection = 'debit' | 'credit';

export interface Transaction {
  id: string;
  householdId: string;
  accountId: string;
  type: TransactionType;
  amount: number | string;
  currency: string;
  categoryId: string | null;
  description: string | null;
  date: string;
  transferPairId: string | null;
  transferDirection: TransferDirection | null;
  // Transfer counterpart (null for non-transfers): one row per pair in the list.
  counterAccountId: string | null;
  counterAmount: number | string | null;
  counterCurrency: string | null;
}

export interface Category {
  id: string;
  householdId: string;
  name: string;
  type: 'income' | 'expense';
  icon: string | null;
  parentId: string | null;
  isArchived: boolean;
}

/** Rows still referencing a category; any non-zero count blocks a permanent delete. */
export interface CategoryImpact {
  categoryId: string;
  transactions: number;
  recurringPayments: number;
  subcategories: number;
  lastUsedAt: string | null;
}

export interface ExchangeRate {
  ccy: string;
  base_ccy: string;
  buy: string;
  sale: string;
}

export type ListStatus = 'active' | 'completed' | 'archived';

export interface ShoppingListItem {
  id: string;
  listId: string;
  productId: string | null;
  name: string;
  // Decimal columns can arrive as strings; always go through Number().
  quantity: number | string;
  unit: string | null;
  preferredStoreId: string | null;
  actualStoreId: string | null;
  isPurchased: boolean;
  price: number | string | null;
}

export interface ShoppingList {
  id: string;
  householdId: string;
  name: string;
  storeId: string | null;
  status: ListStatus;
  createdBy: string;
  createdAt: string;
  items: ShoppingListItem[];
}
