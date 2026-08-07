import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AccountBalanceController } from './account-balance.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { BalanceAdjustmentService } from './balance-adjustment.service';
import { TransferDomainService } from './transfer-domain.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), AccountsModule],
  controllers: [TransactionsController, AccountBalanceController],
  providers: [TransactionsService, BalanceAdjustmentService, TransferDomainService],
})
export class TransactionsModule {}
