import { AuditLog } from '@household/audit';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { IncomeSource } from '../income-sources/entities/income-source.entity';
import { RecurringPayment } from '../recurring-payments/entities/recurring-payment.entity';
import { ExchangeRate } from '../rates/entities/exchange-rate.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { HouseholdCurrency } from '../currencies/entities/household-currency.entity';
import { AccountTypeCatalog } from '../account-types/entities/account-type-catalog.entity';
import { HouseholdAccountType } from '../account-types/entities/household-account-type.entity';

export const entities = [
  Account,
  Transaction,
  Category,
  IncomeSource,
  RecurringPayment,
  ExchangeRate,
  Currency,
  HouseholdCurrency,
  AccountTypeCatalog,
  HouseholdAccountType,
  AuditLog,
];
