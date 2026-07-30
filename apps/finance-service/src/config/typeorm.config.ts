import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { IncomeSource } from '../income-sources/entities/income-source.entity';
import { RecurringPayment } from '../recurring-payments/entities/recurring-payment.entity';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'finance',
    entities: [Account, Transaction, Category, IncomeSource, RecurringPayment],
    migrations: ['src/migrations/*.ts'],
  }),
  synchronize: false,
});
