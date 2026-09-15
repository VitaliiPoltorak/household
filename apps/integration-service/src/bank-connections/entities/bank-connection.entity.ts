import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum BankProvider {
  MONOBANK = 'monobank',
}

export enum BankConnectionStatus {
  ACTIVE = 'active',
  ERROR = 'error',
  DISCONNECTED = 'disconnected',
}

@Entity({ name: 'bank_connections', schema: 'integration' })
export class BankConnection extends BaseEntity {
  @Index()
  @Column({ name: 'household_id' })
  householdId: string;

  @Column({ type: 'enum', enum: BankProvider, default: BankProvider.MONOBANK })
  provider: BankProvider;

  // AES-256-GCM ciphertext (base64), never returned to a client — see
  // libs/common's encryptSecret/decryptSecret and BankConnectionsService.
  @Column({ name: 'token_encrypted', type: 'text' })
  tokenEncrypted: string;

  // Monobank client id from /personal/client-info, kept for display/debugging.
  @Column({ name: 'monobank_client_id', type: 'varchar', nullable: true })
  monobankClientId: string | null;

  // Per-account state (formerly a single monobankAccountId/maskedPan pair
  // here) now lives in BankAccount — one connection can have several
  // accounts/jars under its token (#293).

  // Timestamp of the last successful `statement` API call on this token —
  // NOT per-account. Monobank's 1-request/60s limit applies per token across
  // every account/jar under it, so this is what SyncScheduler gates on
  // between accounts within a run.
  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @Column({
    type: 'enum',
    enum: BankConnectionStatus,
    default: BankConnectionStatus.ACTIVE,
  })
  status: BankConnectionStatus;
}
