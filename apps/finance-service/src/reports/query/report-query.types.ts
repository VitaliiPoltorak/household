/**
 * Domain-shaped aggregate types returned by the read-model query repositories.
 *
 * These types intentionally use primitive numbers (not TypeORM entities or raw
 * SQL row strings) so ReportsService never has to know how the aggregation was
 * produced — an in-memory implementation could return the same shapes.
 */

export interface DateRange {
  from: string;
  to: string;
}

export interface DailyIncomeExpense {
  date: string;
  income: number;
  expense: number;
}

export interface CategoryAggregate {
  categoryId: string | null;
  total: number;
  count: number;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
}
