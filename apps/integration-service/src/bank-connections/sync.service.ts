import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import Redis from 'ioredis';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { InjectRedis } from '../redis/redis.module';
import {
  BankConnection,
  BankConnectionStatus,
} from './entities/bank-connection.entity';
import { BankSyncLog, SyncStatus } from './entities/bank-sync-log.entity';
import { ExternalTransaction } from '../external-transactions/entities/external-transaction.entity';
import { BankConnectionsService } from './bank-connections.service';
import { MonobankClientService } from '../monobank/monobank-client.service';

const SYNC_LOCK_TTL_SECONDS = 60;
const MIN_SYNC_INTERVAL_MS = 60_000; // Monobank: 1 statement request / 60s / token
const MAX_LOOKBACK_MS = (31 * 24 + 1) * 60 * 60 * 1000; // Monobank: 31 days + 1 hour max range

/**
 * Orchestrates one Monobank statement sync for a connection (#20). Two
 * distinct safety mechanisms, not one:
 *  - the Redis lock (`sync:lock:{connectionId}`) prevents two syncs for the
 *    same connection running concurrently (e.g. a double click), with a TTL
 *    as a crash safety net so a dead process can't wedge it forever;
 *  - the lastSyncAt check enforces the 60s-per-token spacing Monobank
 *    requires even when syncs never overlap (the lock alone doesn't cover
 *    "ran, finished in 2s, immediately triggered again").
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(BankConnection)
    private readonly connectionRepo: Repository<BankConnection>,
    @InjectRepository(BankSyncLog)
    private readonly syncLogRepo: Repository<BankSyncLog>,
    @InjectRepository(ExternalTransaction)
    private readonly externalTxRepo: Repository<ExternalTransaction>,
    private readonly connections: BankConnectionsService,
    private readonly monobank: MonobankClientService,
    @InjectRedis() private readonly redis: Redis,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async sync(connectionId: string, householdId: string): Promise<BankSyncLog> {
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
    if (!connection.monobankAccountId) {
      throw new ConflictException(
        'This connection has no Monobank account to sync',
      );
    }

    const lockKey = `sync:lock:${connectionId}`;
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      SYNC_LOCK_TTL_SECONDS,
      'NX',
    );
    if (!acquired) {
      throw new ConflictException(
        'A sync for this connection is already in progress',
      );
    }

    try {
      return await this.runSync(connection, householdId);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async runSync(
    connection: BankConnection,
    householdId: string,
  ): Promise<BankSyncLog> {
    const startedAt = new Date();
    let log = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        connectionId: connection.id,
        startedAt,
        status: SyncStatus.RUNNING,
        transactionsCount: 0,
      }),
    );

    await this.events.emit(
      'integration.monobank.sync.started',
      { connectionId: connection.id },
      { householdId },
    );

    try {
      const token = this.connections.decryptToken(connection);
      const fromMs = connection.lastSyncAt
        ? connection.lastSyncAt.getTime()
        : Date.now() - MAX_LOOKBACK_MS;
      const clampedFromMs = Math.max(fromMs, Date.now() - MAX_LOOKBACK_MS);

      const items = await this.monobank.getStatement(
        token,
        connection.monobankAccountId as string,
        Math.floor(clampedFromMs / 1000),
      );

      if (items.length > 0) {
        // TypeORM's QueryDeepPartialEntity recurses into jsonb-typed columns
        // instead of accepting a plain object for them — cast rather than
        // fight the upsert() typing for a column that's genuinely a JSON blob.
        const rows = items.map((item) => ({
          connectionId: connection.id,
          externalId: item.id,
          rawData: item as unknown as Record<string, unknown>,
        })) as unknown as QueryDeepPartialEntity<ExternalTransaction>[];
        await this.externalTxRepo.upsert(rows, ['connectionId', 'externalId']);
      }

      const finishedAt = new Date();
      await this.connectionRepo.update(connection.id, {
        lastSyncAt: finishedAt,
        status: BankConnectionStatus.ACTIVE,
      });
      log = await this.saveLog(log, {
        finishedAt,
        status: SyncStatus.SUCCESS,
        transactionsCount: items.length,
      });

      await this.events.emit(
        'integration.monobank.sync.completed',
        { connectionId: connection.id, transactionsCount: items.length },
        { householdId },
      );

      return log;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown sync error';
      this.logger.warn(
        `Sync failed for connection ${connection.id}: ${message}`,
      );

      await this.connectionRepo.update(connection.id, {
        status: BankConnectionStatus.ERROR,
      });
      await this.saveLog(log, {
        finishedAt: new Date(),
        status: SyncStatus.FAILED,
        error: message,
      });

      await this.events.emit(
        'integration.monobank.sync.failed',
        { connectionId: connection.id, error: message },
        { householdId },
      );

      throw err;
    }
  }

  private saveLog(
    log: BankSyncLog,
    patch: Partial<BankSyncLog>,
  ): Promise<BankSyncLog> {
    return this.syncLogRepo.save({ ...log, ...patch });
  }
}
