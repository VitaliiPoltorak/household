import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { Category } from '../categories/entities/category.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ACCOUNT_QUERY_REPOSITORY } from './query/account-query.repository';
import { TRANSACTION_QUERY_REPOSITORY } from './query/transaction-query.repository';
import { TypeormAccountQueryRepository } from './query/typeorm-account-query.repository';
import { TypeormTransactionQueryRepository } from './query/typeorm-transaction-query.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Account, Category])],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: TRANSACTION_QUERY_REPOSITORY, useClass: TypeormTransactionQueryRepository },
    { provide: ACCOUNT_QUERY_REPOSITORY, useClass: TypeormAccountQueryRepository },
  ],
})
export class ReportsModule {}
