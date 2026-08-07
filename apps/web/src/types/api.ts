// Auth
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  createdAt: string;
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

// Finance
export type AccountType = 'cash' | 'bank' | 'crypto' | 'investment' | 'deposit';

export interface Account {
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  isArchived: boolean;
}

export interface AccountSummary {
  totalBalance: number;
  accounts: Account[];
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';

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
  createdAt: string;
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
  totalIncome: number;
  totalExpense: number;
  net: number;
  byDay: { date: string; income: number; expense: number }[];
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
