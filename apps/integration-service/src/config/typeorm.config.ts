import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { BankConnection } from '../bank-connections/entities/bank-connection.entity';
import { BankSyncLog } from '../bank-connections/entities/bank-sync-log.entity';
import { ExternalTransaction } from '../external-transactions/entities/external-transaction.entity';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'integration',
    entities: [BankConnection, BankSyncLog, ExternalTransaction],
    migrations: ['src/migrations/*.ts'],
  }),
  synchronize: false,
});
