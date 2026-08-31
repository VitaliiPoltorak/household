import { AuditLog } from '@household/audit';
import { BankConnection } from '../bank-connections/entities/bank-connection.entity';
import { BankSyncLog } from '../bank-connections/entities/bank-sync-log.entity';
import { ExternalTransaction } from '../external-transactions/entities/external-transaction.entity';

export const entities = [
  BankConnection,
  BankSyncLog,
  ExternalTransaction,
  AuditLog,
];
