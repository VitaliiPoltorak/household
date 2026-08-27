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

  // The Monobank account (card/jar) statements are synced from. MVP scope
  // (#20) syncs one account per connection — Monobank's 1-request/60s limit
  // applies per token across ALL accounts, so syncing several accounts on
  // one manual trigger would either serialize behind that limit (a single
  // HTTP request taking minutes) or need a background queue. Multi-account
  // sync is a natural follow-up once #21's account mapping exists to give
  // each Monobank account somewhere to map to.
  @Column({ name: 'monobank_account_id', type: 'varchar', nullable: true })
  monobankAccountId: string | null;

  // Monobank's own masked PAN for the synced account (e.g. "444455******1234"),
  // captured once at connect() time purely for display — the UI has nothing
  // human-recognizable to show otherwise (monobankAccountId is an opaque id).
  // Never a security control: this is what Monobank itself already sends
  // back over the wire on every client-info call, not raw card data.
  @Column({ name: 'masked_pan', type: 'varchar', nullable: true })
  maskedPan: string | null;

  // Maps a Monobank account id -> internal finance-service account id.
  // Populated by the mapping flow (#21); left empty by connect() here.
  @Column({ name: 'account_mappings', type: 'jsonb', default: '{}' })
  accountMappings: Record<string, string>;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @Column({
    type: 'enum',
    enum: BankConnectionStatus,
    default: BankConnectionStatus.ACTIVE,
  })
  status: BankConnectionStatus;
}
