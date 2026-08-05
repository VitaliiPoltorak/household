import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AccountBalanceController } from './account-balance.controller';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), AccountsModule],
  controllers: [TransactionsController, AccountBalanceController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
