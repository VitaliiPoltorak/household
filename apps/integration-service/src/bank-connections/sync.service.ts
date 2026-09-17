import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import {
  BankConnection,
  BankConnectionStatus,
} from './entities/bank-connection.entity';
import { BankAccount } from './entities/bank-account.entity';
import { BankSyncLog, SyncStatus } from './entities/bank-sync-log.entity';
import { ExternalTransaction } from '../external-transactions/entities/external-transaction.entity';
import { BankConnectionsService } from './bank-connections.service';
import {
  MonobankClientService,
  MonobankStatementItem,
} from '../monobank/monobank-client.service';

export const MIN_SYNC_INTERVAL_MS = 60_000; // Monobank: 1 statement request / 60s / token
export const MAX_LOOKBACK_MS = (31 * 24 + 1) * 60 * 60 * 1000; // Monobank: 31 days + 1 hour max range

export interface AccountSyncResult {
  ok: boolean;
  transactionsCount: number;
  error?: string;
}

/**
 * The account-level sync primitive (#20, extended by #293) plus the queue
 * entry point. Actually walking a queued run's accounts one at a time,
 * spaced 60s apart, is SyncScheduler's job — this service only knows how to
 * enqueue a run and how to sync exactly one account, so both the scheduler
 * (polling) and the webhook handler (#292, applyWebhookEvent) share the one
 * upsertItems() path rather than duplicating it.
 */
@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(BankConnection)
    private readonly connectionRepo: Repository<BankConnection>,
    @InjectRepository(BankAccount)
    private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(BankSyncLog)
    private readonly syncLogRepo: Repository<BankSyncLog>,
    @InjectRepository(ExternalTransaction)
    private readonly externalTxRepo: Repository<ExternalTransaction>,
    private readonly connections: BankConnectionsService,
    private readonly monobank: MonobankClientService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  /**
   * Accepts a sync request and returns immediately — SyncScheduler does the
   * actual work in the background (#293). Two front-door checks, both cheap
   * DB reads, catch the common cases without needing the Redis lock (that
   * stays scoped to serializing actual Monobank calls, in SyncScheduler):
   * the per-token 60s spacing, and "a run is already queued/running".
   */
  async enqueue(
    connectionId: string,
    householdId: string,
  ): Promise<BankSyncLog> {
    const connection = await this.connections.findOne(
      connectionId,
      householdId,
    );

    if (connection.lastSyncAt) {
      const elapsed = Date.now() - connection.lastSyncAt.getTime();
      if (elapsed < MIN_SYNC_INTERVAL_MS) {
        throw new ConflictException(
          `Monobank allows one statement request per 60s per token — try again in ${Math.ceil((MIN_SYNC_INTERVAL_MS - elapsed) / 1000)}s`,
        );
      }
    }

    const activeRun = await this.syncLogRepo.findOne({
      where: [
        { connectionId, status: SyncStatus.QUEUED },
        { connectionId, status: SyncStatus.RUNNING },
      ],
    });
    if (activeRun) {
      throw new ConflictException(
        'A sync for this connection is already in progress',
      );
    }

    const accountsTotal = await this.accountRepo.count({
      where: { connectionId, syncEnabled: true },
    });
    if (accountsTotal === 0) {
      throw new ConflictException(
        'This connection has no accounts enabled for sync',
      );
    }

    const run = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        connectionId,
        startedAt: new Date(),
        status: SyncStatus.QUEUED,
        transactionsCount: 0,
        accountsTotal,
        accountsDone: 0,
      }),
    );

    await this.events.emit(
      'integration.monobank.sync.started',
      { connectionId, accountsTotal },
      { householdId },
    );

    return run;
  }

  /**
   * Fetches and upserts one account's statement since its last sync (or the
   * 31-day lookback cap for a first sync). Never throws for a normal
   * Monobank/decrypt failure — callers (SyncScheduler) get a typed result
   * instead, since a single bad account must not abort whichever loop is
   * driving it. The webhook path (#292) doesn't call Monobank at all, so it
   * uses applyWebhookEvent() below instead, sharing only upsertItems().
   */
  async syncAccount(
    connection: BankConnection,
    account: BankAccount,
  ): Promise<AccountSyncResult> {
    try {
      const token = this.connections.decryptToken(connection);
      const fromMs = account.lastSyncAt
        ? account.lastSyncAt.getTime()
        : Date.now() - MAX_LOOKBACK_MS;
      const clampedFromMs = Math.max(fromMs, Date.now() - MAX_LOOKBACK_MS);

      const items = await this.monobank.getStatement(
        token,
        account.monobankAccountId,
        Math.floor(clampedFromMs / 1000),
      );

      await this.upsertItems(connection.id, account.id, items);

      await this.accountRepo.update(account.id, {
        lastSyncAt: new Date(),
        lastError: null,
      });
      return { ok: true, transactionsCount: items.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown sync error';
      // lastSyncAt advances here too, on failure — not just lastError. The
      // account-due query SyncScheduler runs (lastSyncAt IS NULL OR <
      // run.startedAt) would otherwise treat a permanently-failing account
      // as forever due, hanging the run rather than letting it finalize as
      // partially/wholly failed. The cost is losing this attempt's lookback
      // window on a transient failure — acceptable next to a run that never
      // terminates.
      await this.accountRepo.update(account.id, {
        lastError: message,
        lastSyncAt: new Date(),
      });
      return { ok: false, transactionsCount: 0, error: message };
    } finally {
      // Bumped unconditionally: a request was attempted against Monobank
      // either way, so it still consumes this token's 60s slot.
      await this.connectionRepo.update(connection.id, {
        lastSyncAt: new Date(),
      });
    }
  }

  /**
   * Applies one Monobank `StatementItem` webhook event (#292). Unlike
   * syncAccount(), this never calls Monobank — the item already arrived in
   * the push — so connection.lastSyncAt (the 60s-per-token polling gate)
   * is deliberately left untouched; bumping it here would eat into
   * SyncScheduler's polling budget for a request Monobank made, not us.
   * Returns null (not an error) when monobankAccountId doesn't match any
   * account we track, or matches one with sync disabled — a household may
   * have jars under this token it never opted into syncing.
   */
  async applyWebhookEvent(
    connection: BankConnection,
    monobankAccountId: string,
    item: MonobankStatementItem,
  ): Promise<AccountSyncResult | null> {
    const account = await this.accountRepo.findOne({
      where: { connectionId: connection.id, monobankAccountId },
    });
    if (!account || !account.syncEnabled) return null;

    await this.upsertItems(connection.id, account.id, [item]);
    await this.accountRepo.update(account.id, {
      lastSyncAt: new Date(),
      lastError: null,
    });

    await this.events.emit(
      'integration.monobank.sync.completed',
      { connectionId: connection.id, transactionsCount: 1 },
      { householdId: connection.householdId },
    );
    return { ok: true, transactionsCount: 1 };
  }

  // Shared by syncAccount() (a Monobank statement response) and
  // applyWebhookEvent() (a single pushed item) — the one place that knows
  // how a MonobankStatementItem becomes an ExternalTransaction row.
  private async upsertItems(
    connectionId: string,
    bankAccountId: string,
    items: MonobankStatementItem[],
  ): Promise<void> {
    if (items.length === 0) return;
    // TypeORM's QueryDeepPartialEntity recurses into jsonb-typed columns
    // instead of accepting a plain object for them — cast rather than fight
    // the upsert() typing for a column that's genuinely a JSON blob.
    const rows = items.map((item) => ({
      connectionId,
      bankAccountId,
      externalId: item.id,
      rawData: item as unknown as Record<string, unknown>,
    })) as unknown as QueryDeepPartialEntity<ExternalTransaction>[];
    await this.externalTxRepo.upsert(rows, ['connectionId', 'externalId']);
  }

  async finalizeRun(
    run: BankSyncLog,
    connection: BankConnection,
  ): Promise<void> {
    const accounts = await this.accountRepo.find({
      where: { connectionId: connection.id, syncEnabled: true },
    });
    // Compares against lastSyncAt (timestamptz), not BaseEntity's updatedAt
    // (plain timestamp, no time zone) — the two column types read back
    // under different assumptions, and comparing across them introduces a
    // spurious skew equal to the DB server's UTC offset. lastSyncAt is
    // always bumped in syncAccount(), success or failure, so it doubles as
    // "was this account touched during this run".
    const failedThisRun = accounts.filter(
      (a) => a.lastError && a.lastSyncAt && a.lastSyncAt >= run.startedAt,
    );
    const allFailed =
      accounts.length > 0 && failedThisRun.length === accounts.length;

    run.finishedAt = new Date();
    run.status = allFailed ? SyncStatus.FAILED : SyncStatus.SUCCESS;
    if (allFailed) run.error = failedThisRun[0]?.lastError ?? 'Sync failed';
    await this.syncLogRepo.save(run);

    await this.connectionRepo.update(connection.id, {
      status: allFailed
        ? BankConnectionStatus.ERROR
        : BankConnectionStatus.ACTIVE,
    });

    await this.events.emit(
      allFailed
        ? 'integration.monobank.sync.failed'
        : 'integration.monobank.sync.completed',
      allFailed
        ? { connectionId: connection.id, error: run.error }
        : {
            connectionId: connection.id,
            transactionsCount: run.transactionsCount,
          },
      { householdId: connection.householdId },
    );
  }
}
