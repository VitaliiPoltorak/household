import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import Redis from 'ioredis';
import { FeatureFlagService } from '@household/feature-flags';
import { InjectRedis } from '../redis/redis.module';
import { BankConnection } from './entities/bank-connection.entity';
import { BankAccount } from './entities/bank-account.entity';
import { BankSyncLog, SyncStatus } from './entities/bank-sync-log.entity';
import { SyncService, MIN_SYNC_INTERVAL_MS } from './sync.service';

const SYNC_LOCK_TTL_SECONDS = 60;

/**
 * Walks every queued/running sync run forward, one account per tick,
 * honouring Monobank's 60s-per-token gap between statement calls (#293).
 * `SyncService.enqueue()` only accepts a request and creates the run row —
 * this is what actually calls Monobank.
 *
 * The @RequireFeature guard on BankConnectionsController only covers the
 * HTTP path (POST .../sync), so this scheduler re-checks the flag itself —
 * same caveat SyncService's predecessor carried before #293 split it out.
 *
 * No leader election: consistent with RecurringPaymentScheduler, correct
 * for the single-container deploy this runs on. The per-connection Redis
 * lock (same `sync:lock:{connectionId}` key POST .../sync's predecessor
 * used) is what would stop a second replica from double-syncing if one is
 * ever added — the DB run row stays the authority on progress either way.
 */
@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    @InjectRepository(BankConnection)
    private readonly connectionRepo: Repository<BankConnection>,
    @InjectRepository(BankAccount)
    private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(BankSyncLog)
    private readonly syncLogRepo: Repository<BankSyncLog>,
    private readonly sync: SyncService,
    private readonly flags: FeatureFlagService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Cron('*/15 * * * * *', { name: 'advanceMonobankSyncs' })
  async advancePendingSyncs(): Promise<void> {
    if (!(await this.flags.isEnabled('monobank-integration'))) return;

    const activeRuns = await this.syncLogRepo.find({
      where: { status: In([SyncStatus.QUEUED, SyncStatus.RUNNING]) },
      order: { startedAt: 'ASC' },
    });
    for (const run of activeRuns) {
      try {
        await this.advanceRun(run);
      } catch (err) {
        // One run's failure must not stop the others from advancing.
        this.logger.error(
          `Sync run ${run.id} tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Public so integration tests can drive one tick synchronously instead of
  // waiting on the cron interval — same reasoning as
  // RecurringPaymentScheduler.firePayment.
  async advanceRun(run: BankSyncLog): Promise<void> {
    const connection = await this.connectionRepo.findOne({
      where: { id: run.connectionId },
    });
    if (!connection) {
      run.status = SyncStatus.FAILED;
      run.finishedAt = new Date();
      run.error = 'Connection no longer exists';
      await this.syncLogRepo.save(run);
      return;
    }

    // Checked before the 60s gate and the lock: finding "nothing left due"
    // makes no Monobank call, so it must not be blocked by either — a
    // single-account run that just synced its one account would otherwise
    // never get to finalize until the gate expired, even though it has
    // nothing left to wait for.
    const account = await this.accountRepo.findOne({
      where: [
        {
          connectionId: connection.id,
          syncEnabled: true,
          lastSyncAt: IsNull(),
        },
        {
          connectionId: connection.id,
          syncEnabled: true,
          lastSyncAt: LessThan(run.startedAt),
        },
      ],
      order: { createdAt: 'ASC' },
    });

    // Finalizing only on "no account left due" (never on an accountsDone
    // counter) keeps this correct if syncEnabled changes mid-run — e.g. a
    // jar gets toggled on after this run's accountsTotal was fixed at
    // enqueue time. Costs at most one extra 15s tick before a run that
    // finished its original count closes out.
    if (!account) {
      await this.sync.finalizeRun(run, connection);
      return;
    }

    if (connection.lastSyncAt) {
      const elapsed = Date.now() - connection.lastSyncAt.getTime();
      if (elapsed < MIN_SYNC_INTERVAL_MS) return; // wait for a later tick
    }

    const lockKey = `sync:lock:${connection.id}`;
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      SYNC_LOCK_TTL_SECONDS,
      'NX',
    );
    if (!acquired) return; // a concurrent tick/manual sync holds it

    try {
      if (run.status === SyncStatus.QUEUED) {
        run.status = SyncStatus.RUNNING;
        await this.syncLogRepo.save(run);
      }

      const result = await this.sync.syncAccount(connection, account);
      run.accountsDone += 1;
      if (result.ok) run.transactionsCount += result.transactionsCount;
      await this.syncLogRepo.save(run);
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
