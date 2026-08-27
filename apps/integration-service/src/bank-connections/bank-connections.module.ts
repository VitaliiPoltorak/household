import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankConnection } from './entities/bank-connection.entity';
import { BankSyncLog } from './entities/bank-sync-log.entity';
import { ExternalTransaction } from '../external-transactions/entities/external-transaction.entity';
import { BankConnectionsService } from './bank-connections.service';
import { SyncService } from './sync.service';
import { BankConnectionsController } from './bank-connections.controller';
import { MonobankModule } from '../monobank/monobank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankConnection,
      BankSyncLog,
      ExternalTransaction,
    ]),
    MonobankModule,
  ],
  controllers: [BankConnectionsController],
  providers: [BankConnectionsService, SyncService],
  exports: [BankConnectionsService],
})
export class BankConnectionsModule {}
