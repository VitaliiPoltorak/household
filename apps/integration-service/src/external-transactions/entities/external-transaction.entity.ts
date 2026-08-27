import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { BankConnection } from '../../bank-connections/entities/bank-connection.entity';

// Raw Monobank statement item shape, kept loose here — MonobankStatementItem
// in monobank-client.service.ts is the typed source. rawData preserves
// whatever the API returned so a future mapping-rule change (#21) can
// re-derive fields without re-fetching from Monobank.
@Entity({ name: 'external_transactions', schema: 'integration' })
@Index(['connectionId', 'externalId'], { unique: true })
export class ExternalTransaction extends BaseEntity {
  @Column({ name: 'connection_id' })
  connectionId: string;

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
}
