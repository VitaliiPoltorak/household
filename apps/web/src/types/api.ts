// Auth
// Post-#60 login/refresh return only the access token in the response body.
// The refresh token and session id live in an HttpOnly cookie set by the
// server. `refreshToken` and `sessionId` are intentionally NOT in this shape.
export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
}

/**
 * Machine-readable `code` field the backend sets on 4xx bodies for the
 * email/password flow (#184, #185). Kept in one place so error mappers
 * cannot drift from what the server actually emits.
 *   - EMAIL_NOT_VERIFIED   (403 on POST /auth/login)
 *   - ACCOUNT_LOCKED       (403 on POST /auth/login after 5 fails)
 *   - INVALID_UNLOCK_TOKEN (400 on POST /auth/unlock)
 *   - CODE_INVALID / CODE_ATTEMPTS_EXHAUSTED / CODE_EXPIRED_OR_MISSING
 *     (400 on POST /auth/verify-email)
 *   - WEAK_PASSWORD / PASSWORD_PWNED / SAME_PASSWORD / NO_PASSWORD_SET
 *     (400 on register / password-change)
 */
export type AuthErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_UNLOCK_TOKEN'
  | 'CODE_INVALID'
  | 'CODE_ATTEMPTS_EXHAUSTED'
  | 'CODE_EXPIRED_OR_MISSING'
  | 'WEAK_PASSWORD'
  | 'PASSWORD_PWNED'
  | 'SAME_PASSWORD'
  | 'NO_PASSWORD_SET';

/** Extra fields the backend puts alongside `code` on the WEAK_PASSWORD body. */
export interface WeakPasswordDetails {
  code: 'WEAK_PASSWORD';
  score: number;
  warning?: string;
  suggestions?: string[];
}

/** Register only echoes back the id + normalized email (no access token — verify first). */
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
}

/**
 * Redacted user shape returned by `GET /auth/users?ids=…`. Any caller with a
 * valid JWT can resolve any userId; no sensitive fields (email, locale, …)
 * are exposed. Used to render member / avatar rows with a display name
 * instead of a raw UUID.
 */
export interface PublicUserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

// Households
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Household {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  role: MemberRole;
  createdAt: string;
}

export interface HouseholdInvite {
  id: string;
  householdId: string;
  email: string;
  token: string;
  role: MemberRole;
  expiresAt: string;
  acceptedAt: string | null;
}

// GET /invites (listing invites addressed to the current user) preloads the
// target household so the /invites page can show its name without a second
// round trip per invite (#267).
export interface HouseholdInviteWithHousehold extends HouseholdInvite {
  household: Household;
}

// Finance
// Open-ended (#227) — validated against the household's enabled account
// types server-side, not a fixed union. The 5 system defaults still exist
// as string literals ('cash' | 'bank' | ...) but households can enable/coin
// their own (e.g. 'paypal').
export type AccountType = string;

export interface Account {
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  isArchived: boolean;
}

// GET /account-types — household-agnostic catalog entry (#227).
export interface AccountTypeCatalogEntry {
  code: string;
  label: string;
  icon: string | null;
  isSystem: boolean;
  createdAt: string;
}

// GET /account-types/enabled — household's enabled join row, with the
// catalog entry preloaded.
export interface EnabledAccountType {
  id: string;
  householdId: string;
  typeCode: string;
  enabledAt: string;
  accountType: AccountTypeCatalogEntry;
}

export interface AccountSummary {
  totalBalance: number;
  accounts: Account[];
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';
export type TransferDirection = 'debit' | 'credit';

/**
 * Wire shape of GET /transactions rows. Transfers surface as a SINGLE row per
 * pair (#167) — the primary side (accountId + amount) is the DEBIT leg by
 * default, or the leg matching the account filter when one is active. The
 * `counter*` fields describe the other leg so the UI can render
 * "From X → To Y" without knowing the pair internals.
 *
 * `counterAmount` + `counterCurrency` are same as `amount` + `currency` today,
 * but they're distinct fields so cross-currency transfers (#162) can plug in
 * without a shape change.
 */
export interface Transaction {
  id: string;
  householdId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  categoryId: string | null;
  incomeSourceId: string | null;
  description: string | null;
  date: string;
  createdBy: string;
  transferPairId: string | null;
  transferDirection: TransferDirection | null;
  createdAt: string;
  // Transfer counterpart (null for non-transfers).
  counterAccountId: string | null;
  counterTransactionId: string | null;
  counterAmount: number | null;
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

export interface CategoryImpact {
  categoryId: string;
  transactions: number;
  recurringPayments: number;
  subcategories: number;
  lastUsedAt: string | null;
}

export interface RecurringPayment {
  id: string;
  householdId: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  frequency: 'weekly' | 'monthly' | 'yearly';
  nextDueDate: string;
  accountId: string | null;
}

export interface MonthlyReport {
  period: string;
  /**
   * Per-currency income/expense/net. A household with UAH + USD accounts
   * gets two entries; summing across currencies without conversion is
   * arithmetically meaningless (#175), so the caller converts via rates.
   */
  byCurrency: Record<string, { income: number; expense: number; net: number }>;
  byDay: { date: string; currency: string; income: number; expense: number }[];
}

export interface NetWorthReport {
  totalBalance: number;
  byCurrency: Record<string, number>;
  accounts: Pick<Account, 'id' | 'name' | 'type' | 'currency' | 'balance'>[];
}

// Shopping
export type StoreType = 'supermarket' | 'greengrocer' | 'pharmacy' | 'other';
export type ListStatus = 'active' | 'completed' | 'archived';

export interface Store {
  id: string;
  householdId: string;
  name: string;
  type: StoreType;
  address: string | null;
}

export interface StoreImpact {
  storeId: string;
  products: number;
  lists: number;
  items: number;
}

export interface Product {
  id: string;
  householdId: string;
  name: string;
  category: string | null;
  unit: string | null;
  preferredStoreId: string | null;
  alternativeStoreIds: string[];
  lastPrice: number | null;
  notes: string | null;
  url: string | null;
  imageUrl: string | null;
  previewTitle: string | null;
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

export interface ShoppingListItem {
  id: string;
  listId: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  preferredStoreId: string | null;
  actualStoreId: string | null;
  isPurchased: boolean;
  price: number | null;
}

export type BankProvider = 'monobank';
export type BankConnectionStatus = 'active' | 'error' | 'disconnected';

export interface BankConnection {
  id: string;
  provider: BankProvider;
  monobankClientId: string | null;
  monobankAccountId: string | null;
  maskedPan: string | null;
  lastSyncAt: string | null;
  status: BankConnectionStatus;
  createdAt: string;
}

export type SyncStatus = 'running' | 'success' | 'failed';

export interface BankSyncLog {
  id: string;
  connectionId: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncStatus;
  error: string | null;
  transactionsCount: number;
  createdAt: string;
}
