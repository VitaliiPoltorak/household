import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalTransaction } from './entities/external-transaction.entity';
import { ExternalTransactionsService } from './external-transactions.service';
import { ExternalTransactionsController } from './external-transactions.controller';
import { FinanceClientService } from './finance-client.service';
import { BankConnectionsModule } from '../bank-connections/bank-connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalTransaction]),
    BankConnectionsModule,
  ],
  controllers: [ExternalTransactionsController],
  providers: [ExternalTransactionsService, FinanceClientService],
})
export class ExternalTransactionsModule {}
