import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { BankConnection } from './bank-connection.entity';

export enum SyncStatus {
  // A run that has been accepted but where SyncScheduler hasn't yet synced
  // any account in it (#293) — what POST .../sync answers 202 with.
  QUEUED = 'queued',
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

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.QUEUED })
  status: SyncStatus;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ name: 'transactions_count', type: 'int', default: 0 })
  transactionsCount: number;

  // Progress within this run (#293) — a run walks its connection's
  // sync-enabled accounts one at a time, spaced 60s apart per Monobank's
  // per-token limit, so a single run can span several minutes.
  @Column({ name: 'accounts_total', type: 'int', default: 0 })
  accountsTotal: number;

  @Column({ name: 'accounts_done', type: 'int', default: 0 })
  accountsDone: number;

  @ManyToOne(() => BankConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection: BankConnection;
}
