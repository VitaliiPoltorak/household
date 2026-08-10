import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from '@household/kafka';
import { ensureSchema } from '@household/database';
import { AuditLog, AuditModule } from '@household/audit';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { IncomeSourcesModule } from './income-sources/income-sources.module';
import { RecurringPaymentsModule } from './recurring-payments/recurring-payments.module';
import { ReportsModule } from './reports/reports.module';
import { Account } from './accounts/entities/account.entity';
import { Transaction } from './transactions/entities/transaction.entity';
import { Category } from './categories/entities/category.entity';
import { IncomeSource } from './income-sources/entities/income-source.entity';
import { RecurringPayment } from './recurring-payments/entities/recurring-payment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        await ensureSchema('finance');
        return {
          type: 'postgres' as const,
          host: config.get<string>('POSTGRES_HOST', 'localhost'),
          port: config.get<number>('POSTGRES_PORT', 5432),
          username: config.get<string>('POSTGRES_USER', 'household'),
          password: config.get<string>('POSTGRES_PASSWORD', 'household_secret'),
          database: config.get<string>('POSTGRES_DB', 'household'),
          schema: 'finance',
          entities: [Account, Transaction, Category, IncomeSource, RecurringPayment, AuditLog],
          synchronize: config.get('NODE_ENV') === 'development',
        };
      },
    }),
    KafkaModule.forRootAsync('finance-service'),
    AuditModule.register(),
    ScheduleModule.forRoot(),
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    IncomeSourcesModule,
    RecurringPaymentsModule,
    ReportsModule,
  ],
})
export class AppModule {}
