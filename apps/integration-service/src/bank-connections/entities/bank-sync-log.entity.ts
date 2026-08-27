import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { BankConnection } from './bank-connection.entity';

export enum SyncStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity({ name: 'bank_sync_logs', schema: 'integration' })
export class BankSyncLog extends BaseEntity {
  @Column({ name: 'connection_id' })
  connectionId: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.RUNNING })
  status: SyncStatus;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ name: 'transactions_count', type: 'int', default: 0 })
  transactionsCount: number;

  @ManyToOne(() => BankConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection: BankConnection;
}
