import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { BankConnection } from './bank-connection.entity';

export enum BankAccountKind {
  ACCOUNT = 'account',
  JAR = 'jar',
}

// One row per Monobank account/jar under a connection's token (#293). A
// household_id column is deliberately omitted — every lookup goes through
// the owning BankConnection, which already carries and enforces it (see
// BankConnectionsService.findOne).
@Entity({ name: 'bank_accounts', schema: 'integration' })
@Index(['connectionId', 'monobankAccountId'], { unique: true })
export class BankAccount extends BaseEntity {
  // No separate single-column index: the composite unique index below has
  // connectionId as its leading column, so it already serves lookups by
  // connectionId alone.
  @Column({ name: 'connection_id' })
  connectionId: string;

  @Column({ name: 'monobank_account_id' })
  monobankAccountId: string;

  @Column({ type: 'enum', enum: BankAccountKind })
  kind: BankAccountKind;

  // Display only — see the identical caveat on the pre-#293 BankConnection
  // column this replaces: this is what Monobank already sends back over the
  // wire, never a security control.
  @Column({ name: 'masked_pan', type: 'varchar', nullable: true })
  maskedPan: string | null;

  // Jar name (e.g. "New car"). Null for a card/account, which has no title
  // of its own in Monobank's client-info response.
  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'varchar', nullable: true })
  iban: string | null;

  // Nullable: the pre-#293 schema never stored a currency on the
  // connection, so the migration's backfill row leaves this unknown for
  // accounts that existed before this column did. Every account created by
  // connect() from here on populates it from client-info.
  @Column({ name: 'currency_code', type: 'int', nullable: true })
  currencyCode: number | null;

  // Cards default true; jars default false — a jar adds another 60s step to
  // every sync run, so it's opt-in (#293 decision).
  @Column({ name: 'sync_enabled', type: 'boolean', default: false })
  syncEnabled: boolean;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @Column({ name: 'last_error', type: 'varchar', nullable: true })
  lastError: string | null;

  @ManyToOne(() => BankConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection: BankConnection;
}
