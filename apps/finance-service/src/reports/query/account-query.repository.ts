import type { Account } from '../../accounts/entities/account.entity';
import type { CurrencyTotal } from './report-query.types';

export const ACCOUNT_QUERY_REPOSITORY = Symbol('ACCOUNT_QUERY_REPOSITORY');

/**
 * Read-model for account aggregations used by ReportsService.
 *
 * `listActive` returns the entity because the net-worth report shapes accounts
 * into a DTO itself — moving that projection here would just push the concern
 * around without simplifying anything. `getBalancesByCurrency` hides the
 * DECIMAL-preserving SQL sum behind a plain typed shape.
 */
export interface IAccountQueryRepository {
  listActive(householdId: string): Promise<Account[]>;
  getBalancesByCurrency(householdId: string): Promise<CurrencyTotal[]>;
}
