import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { BankConnection } from '../../bank-connections/entities/bank-connection.entity';
import { BankAccount } from '../../bank-connections/entities/bank-account.entity';

// Raw Monobank statement item shape, kept loose here — MonobankStatementItem
// in monobank-client.service.ts is the typed source. rawData preserves
// whatever the API returned so a future mapping-rule change (#21) can
// re-derive fields without re-fetching from Monobank.
@Entity({ name: 'external_transactions', schema: 'integration' })
@Index(['connectionId', 'externalId'], { unique: true })
export class ExternalTransaction extends BaseEntity {
  @Column({ name: 'connection_id' })
  connectionId: string;

  // Which account/jar under the connection this came from (#293). Nullable
  // because rows synced before #293 have no BankAccount to point at — the
  // backfill migration only creates one BankAccount per pre-existing
  // connection and points existing rows at it, so this is populated for
  // every row going forward.
  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'external_id' })
  externalId: string;

  @Column({ name: 'raw_data', type: 'jsonb' })
  rawData: Record<string, unknown>;

  // Set by the mapping flow (#21) once linked to a finance-service transaction.
  @Column({ name: 'mapped_transaction_id', type: 'varchar', nullable: true })
  mappedTransactionId: string | null;

  @ManyToOne(() => BankConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection: BankConnection;

  @ManyToOne(() => BankAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount | null;
}
