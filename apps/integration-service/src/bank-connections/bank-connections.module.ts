import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankConnection } from './entities/bank-connection.entity';
import { BankAccount } from './entities/bank-account.entity';
import { BankSyncLog } from './entities/bank-sync-log.entity';
import { ExternalTransaction } from '../external-transactions/entities/external-transaction.entity';
import { BankConnectionsService } from './bank-connections.service';
import { SyncService } from './sync.service';
import { SyncScheduler } from './sync.scheduler';
import { BankConnectionsController } from './bank-connections.controller';
import { MonobankModule } from '../monobank/monobank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankConnection,
      BankAccount,
      BankSyncLog,
      ExternalTransaction,
    ]),
    MonobankModule,
  ],
  controllers: [BankConnectionsController],
  providers: [BankConnectionsService, SyncService, SyncScheduler],
  exports: [BankConnectionsService, SyncService],
})
export class BankConnectionsModule {}
