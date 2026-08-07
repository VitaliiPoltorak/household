import type {
  CategoryAggregate,
  DailyIncomeExpense,
  DateRange,
} from './report-query.types';

export const TRANSACTION_QUERY_REPOSITORY = Symbol('TRANSACTION_QUERY_REPOSITORY');

/**
 * Read-model for transaction aggregations used by ReportsService.
 *
 * The interface exposes only the shapes reports actually need — not the whole
 * Transaction entity — so callers can be unit-tested with in-memory fakes and
 * the SQL is centralized in one implementation.
 */
export interface ITransactionQueryRepository {
  getDailyIncomeExpense(
    householdId: string,
    range: DateRange,
  ): Promise<DailyIncomeExpense[]>;

  getByCategory(
    householdId: string,
    range: DateRange,
    type: 'income' | 'expense',
  ): Promise<CategoryAggregate[]>;
}
