import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AccountBalanceController } from './account-balance.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { IncomeSourcesModule } from '../income-sources/income-sources.module';
import { BalanceAdjustmentService } from './balance-adjustment.service';
import { TransferDomainService } from './transfer-domain.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), AccountsModule, CategoriesModule, IncomeSourcesModule],
  controllers: [TransactionsController, AccountBalanceController],
  providers: [TransactionsService, BalanceAdjustmentService, TransferDomainService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
