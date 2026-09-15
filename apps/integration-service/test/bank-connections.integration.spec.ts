import {
  BadGatewayException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import Redis from 'ioredis';
import { encryptSecret } from '@household/common';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
  mockKafkaProducer,
} from '@household/testing';
import { AppModule } from '../src/app.module';
import {
  MonobankClientService,
  type MonobankClientInfo,
  type MonobankStatementItem,
} from '../src/monobank/monobank-client.service';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import {
  BankConnection,
  BankConnectionStatus,
  BankProvider,
} from '../src/bank-connections/entities/bank-connection.entity';
import {
  BankAccount,
  BankAccountKind,
} from '../src/bank-connections/entities/bank-account.entity';
import {
  BankSyncLog,
  SyncStatus,
} from '../src/bank-connections/entities/bank-sync-log.entity';
import { SyncScheduler } from '../src/bank-connections/sync.scheduler';

function defaultClientInfo(): MonobankClientInfo {
  return {
    clientId: 'mono-client-1',
    name: 'Test User',
    accounts: [
      {
        id: 'acc-1',
        balance: 100000,
        currencyCode: 980,
        type: 'black',
        maskedPan: ['444455******1234'],
        iban: 'UA000000000000000000000000000',
      },
    ],
  };
}

function defaultStatementItems(): Record<string, MonobankStatementItem[]> {
  return {
    'acc-1': [
      {
        id: 'tx-1',
        time: Math.floor(Date.now() / 1000),
        description: 'Coffee',
        mcc: 5814,
        amount: -5000,
        operationAmount: -5000,
        currencyCode: 980,
        balance: 95000,
      },
    ],
  };
}

class FakeMonobankClient {
  clientInfo: MonobankClientInfo = defaultClientInfo();
  statementItems: Record<string, MonobankStatementItem[]> =
    defaultStatementItems();
  shouldFailClientInfo = false;
  shouldFailStatement = false;

  async getClientInfo(): Promise<MonobankClientInfo> {
    if (this.shouldFailClientInfo) {
      throw new UnauthorizedException('Invalid or revoked Monobank token');
    }
    return this.clientInfo;
  }

  async getStatement(
    _token: string,
    account: string,
  ): Promise<MonobankStatementItem[]> {
    if (this.shouldFailStatement) {
      throw new BadGatewayException('Monobank request failed (500)');
    }
    return this.statementItems[account] ?? [];
  }
}

const H = 'test-household-id';

describe('Bank connections (integration)', () => {
  let app: INestApplication;
  let fakeMonobank: FakeMonobankClient;
  let redis: Redis;
  let scheduler: SyncScheduler;
  let syncLogRepo: Repository<BankSyncLog>;

  beforeAll(async () => {
    fakeMonobank = new FakeMonobankClient();
    app = await createTestApp(AppModule, (b) =>
      b.overrideProvider(MonobankClientService).useValue(fakeMonobank),
    );
    redis = app.get<Redis>(REDIS_CLIENT);
    scheduler = app.get<SyncScheduler>(SyncScheduler);
    syncLogRepo = app.get<Repository<BankSyncLog>>(
      getRepositoryToken(BankSyncLog),
    );
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    fakeMonobank.shouldFailClientInfo = false;
    fakeMonobank.shouldFailStatement = false;
    // Fresh objects each test — several tests mutate clientInfo/statementItems
    // (jars, "no accounts", multi-account) and this fixture is shared across
    // the whole file, so a stale mutation would otherwise leak into every
    // later test.
    fakeMonobank.clientInfo = defaultClientInfo();
    fakeMonobank.statementItems = defaultStatementItems();
    const lockKeys = await redis.keys('sync:lock:*');
    if (lockKeys.length > 0) await redis.del(...lockKeys);
    const flagKeys = await redis.keys('flag:*');
    if (flagKeys.length > 0) await redis.del(...flagKeys);
  });

  afterAll(async () => {
    await redis.quit();
    await app.close();
  });

  function connect(householdId = H) {
    return request(app.getHttpServer())
      .post('/monobank/connect')
      .set('X-Household-Id', householdId)
      .send({ token: 'mono-token-abc' });
  }

  // Drives every queued/running run one tick at a time until none are left,
  // so a test can assert on the finished state without waiting on the real
  // 15s cron interval. Bounded so a stuck run fails the test loudly instead
  // of hanging.
  async function drainSyncs(maxTicks = 20): Promise<void> {
    for (let i = 0; i < maxTicks; i++) {
      const active = await syncLogRepo.find({
        where: [{ status: SyncStatus.QUEUED }, { status: SyncStatus.RUNNING }],
      });
      if (active.length === 0) return;
      for (const run of active) {
        const lockKeys = await redis.keys('sync:lock:*');
        if (lockKeys.length > 0) await redis.del(...lockKeys);
        await scheduler.advanceRun(run);
      }
    }
    throw new Error('drainSyncs: runs still active after maxTicks');
  }

  async function connectAndSync(householdId = H) {
    const created = await connect(householdId).expect(201);
    await request(app.getHttpServer())
      .post(`/monobank/connections/${created.body.id}/sync`)
      .set('X-Household-Id', householdId)
      .expect(202);
    await drainSyncs();
    return created;
  }

  describe('POST /monobank/connect', () => {
    it('validates the token against Monobank and stores the connection with its accounts', async () => {
      const res = await connect().expect(201);

      expect(res.body).toMatchObject({
        provider: 'monobank',
        monobankClientId: 'mono-client-1',
        status: 'active',
        lastSyncAt: null,
      });
      expect(res.body.accounts).toHaveLength(1);
      expect(res.body.accounts[0]).toMatchObject({
        maskedPan: '444455******1234',
        syncEnabled: true,
        lastSyncAt: null,
      });
      expect(res.body.token).toBeUndefined();
      expect(res.body.tokenEncrypted).toBeUndefined();
    });

    it('stores jars as sync-disabled accounts', async () => {
      fakeMonobank.clientInfo = {
        ...fakeMonobank.clientInfo,
        jars: [
          {
            id: 'jar-1',
            sendId: 'send-1',
            title: 'New car',
            currencyCode: 980,
            balance: 500000,
          },
        ],
      };

      const res = await connect().expect(201);

      const jar = res.body.accounts.find(
        (a: { kind: string }) => a.kind === 'jar',
      );
      expect(jar).toMatchObject({ title: 'New car', syncEnabled: false });
    });

    it('rejects without X-Household-Id', async () => {
      await request(app.getHttpServer())
        .post('/monobank/connect')
        .send({ token: 'mono-token-abc' })
        .expect(401);
    });

    it('rejects an invalid Monobank token without persisting a connection', async () => {
      fakeMonobank.shouldFailClientInfo = true;
      await connect().expect(401);

      const list = await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });
  });

  describe('GET /monobank/connections', () => {
    it('returns only connections for the household', async () => {
      await connect(H);
      await connect('other-household');

      const res = await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('PATCH /monobank/connections/:id/accounts/:accountId', () => {
    it('toggles an account (e.g. a jar) on for sync', async () => {
      fakeMonobank.clientInfo = {
        ...fakeMonobank.clientInfo,
        jars: [
          {
            id: 'jar-1',
            sendId: 'send-1',
            title: 'New car',
            currencyCode: 980,
            balance: 500000,
          },
        ],
      };
      const created = await connect().expect(201);
      const jar = created.body.accounts.find(
        (a: { kind: string }) => a.kind === 'jar',
      );

      const res = await request(app.getHttpServer())
        .patch(`/monobank/connections/${created.body.id}/accounts/${jar.id}`)
        .set('X-Household-Id', H)
        .send({ enabled: true })
        .expect(200);

      expect(res.body).toMatchObject({ id: jar.id, syncEnabled: true });
    });

    it('returns 404 for an account in another household', async () => {
      const created = await connect().expect(201);
      const account = created.body.accounts[0];

      await request(app.getHttpServer())
        .patch(
          `/monobank/connections/${created.body.id}/accounts/${account.id}`,
        )
        .set('X-Household-Id', 'other-household')
        .send({ enabled: false })
        .expect(404);
    });
  });

  describe('DELETE /monobank/connections/:id', () => {
    it('deletes a connection', async () => {
      const created = await connect();

      await request(app.getHttpServer())
        .delete(`/monobank/connections/${created.body.id}`)
        .set('X-Household-Id', H)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H);
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for a connection in another household', async () => {
      const created = await connect();

      await request(app.getHttpServer())
        .delete(`/monobank/connections/${created.body.id}`)
        .set('X-Household-Id', 'other-household')
        .expect(404);
    });
  });

  describe('POST /monobank/connections/:id/sync', () => {
    it('enqueues a run, syncs the account, and emits Kafka events', async () => {
      const created = await connect();

      const res = await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);
      expect(res.body).toMatchObject({
        status: 'queued',
        accountsTotal: 1,
        accountsDone: 0,
      });

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'integration.monobank.sync.started',
        { connectionId: created.body.id, accountsTotal: 1 },
        expect.objectContaining({ householdId: H }),
      );

      await drainSyncs();

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'integration.monobank.sync.completed',
        { connectionId: created.body.id, transactionsCount: 1 },
        expect.objectContaining({ householdId: H }),
      );

      const connections = await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H);
      expect(connections.body[0].lastSyncAt).not.toBeNull();
      expect(connections.body[0].accounts[0].lastSyncAt).not.toBeNull();

      const logs = await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H);
      expect(logs.body[0]).toMatchObject({
        status: 'success',
        transactionsCount: 1,
        accountsDone: 1,
        accountsTotal: 1,
      });
    });

    it('returns 404 for a connection in another household', async () => {
      const created = await connect();
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', 'other-household')
        .expect(404);
    });

    it('rejects a second sync within 60s of the last one', async () => {
      const created = await connectAndSync();

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(409);
    });

    it('rejects enqueueing while a run is already queued/running', async () => {
      const created = await connect();
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(409);
    });

    it('rejects when the connection has no accounts enabled for sync', async () => {
      fakeMonobank.clientInfo = { ...fakeMonobank.clientInfo, accounts: [] };
      const created = await connect();

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(409);
    });

    it('marks the run failed and emits sync.failed when Monobank errors', async () => {
      const created = await connect();
      fakeMonobank.shouldFailStatement = true;

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);
      await drainSyncs();

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'integration.monobank.sync.failed',
        expect.objectContaining({ connectionId: created.body.id }),
        expect.objectContaining({ householdId: H }),
      );

      const connections = await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H);
      expect(connections.body[0].status).toBe('error');

      const logs = await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H);
      expect(logs.body[0]).toMatchObject({ status: 'failed' });
    });

    it('syncs multiple accounts one at a time across ticks, respecting the per-token gate', async () => {
      fakeMonobank.clientInfo = {
        clientId: 'mono-client-1',
        name: 'Test User',
        accounts: [
          {
            id: 'acc-1',
            balance: 100000,
            currencyCode: 980,
            type: 'black',
            maskedPan: ['444455******1234'],
            iban: 'UA1',
          },
          {
            id: 'acc-2',
            balance: 200000,
            currencyCode: 840,
            type: 'white',
            maskedPan: ['555566******5678'],
            iban: 'UA2',
          },
        ],
      };
      fakeMonobank.statementItems = {
        'acc-1': [
          {
            id: 'tx-1',
            time: Math.floor(Date.now() / 1000),
            description: 'Coffee',
            mcc: 5814,
            amount: -5000,
            operationAmount: -5000,
            currencyCode: 980,
            balance: 95000,
          },
        ],
        'acc-2': [
          {
            id: 'tx-2',
            time: Math.floor(Date.now() / 1000),
            description: 'Groceries',
            mcc: 5411,
            amount: -3000,
            operationAmount: -3000,
            currencyCode: 840,
            balance: 197000,
          },
        ],
      };
      const created = await connect();

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);

      // First tick: one account syncs, connection.lastSyncAt is now set, so
      // the run stays active but the second account waits for the 60s gate.
      const runBeforeSecondTick = (
        await syncLogRepo.find({
          where: [
            { status: SyncStatus.RUNNING },
            { status: SyncStatus.QUEUED },
          ],
        })
      )[0];
      await scheduler.advanceRun(runBeforeSecondTick);

      const midway = await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H);
      expect(midway.body[0]).toMatchObject({
        status: 'running',
        accountsDone: 1,
        accountsTotal: 2,
      });

      const secondTick = await syncLogRepo.findOneOrFail({
        where: { connectionId: created.body.id },
      });
      await scheduler.advanceRun(secondTick); // gated — under 60s since acc-1's call
      const stillMidway = await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H);
      expect(stillMidway.body[0].accountsDone).toBe(1);

      // Force the gate open, as a real 60s wait would.
      const connectionRepo = app.get<Repository<BankConnection>>(
        getRepositoryToken(BankConnection),
      );
      await connectionRepo.update(created.body.id, {
        lastSyncAt: new Date(Date.now() - 61_000),
      });
      await scheduler.advanceRun(secondTick);
      await scheduler.advanceRun(secondTick); // finalize tick

      const final = await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H);
      expect(final.body[0]).toMatchObject({
        status: 'success',
        accountsDone: 2,
        accountsTotal: 2,
        transactionsCount: 2,
      });
    });
  });

  describe('GET /monobank/connections/:id/logs', () => {
    it('returns 404 for a connection in another household', async () => {
      const created = await connect();
      await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', 'other-household')
        .expect(404);
    });
  });

  describe('TOKEN_ENCRYPTION_KEY rotation (#296)', () => {
    // Simulates a row encrypted before a key rotation: the connection's
    // tokenEncrypted is under OLD_KEY, while the app boots with the default
    // primary key (TOKEN_ENCRYPTION_KEY=test-token-encryption-key, set by
    // libs/testing/jest.env.js) and OLD_KEY only as TOKEN_ENCRYPTION_KEY_PREV.
    const OLD_KEY = 'old-key-from-before-the-rotation';
    let rotationApp: INestApplication;
    let rotationMonobank: FakeMonobankClient & { receivedToken?: string };
    let connectionRepo: Repository<BankConnection>;
    let accountRepo: Repository<BankAccount>;
    let rotationScheduler: SyncScheduler;
    let rotationSyncLogRepo: Repository<BankSyncLog>;
    let rotationRedis: Redis;

    beforeAll(async () => {
      process.env.TOKEN_ENCRYPTION_KEY_PREV = OLD_KEY;
      rotationMonobank = Object.assign(new FakeMonobankClient(), {
        receivedToken: undefined as string | undefined,
      });
      rotationMonobank.getStatement = async function (
        this: FakeMonobankClient & { receivedToken?: string },
        token: string,
        account: string,
      ) {
        this.receivedToken = token;
        return this.statementItems[account] ?? [];
      };
      rotationApp = await createTestApp(AppModule, (b) =>
        b.overrideProvider(MonobankClientService).useValue(rotationMonobank),
      );
      connectionRepo = rotationApp.get<Repository<BankConnection>>(
        getRepositoryToken(BankConnection),
      );
      accountRepo = rotationApp.get<Repository<BankAccount>>(
        getRepositoryToken(BankAccount),
      );
      rotationScheduler = rotationApp.get<SyncScheduler>(SyncScheduler);
      rotationSyncLogRepo = rotationApp.get<Repository<BankSyncLog>>(
        getRepositoryToken(BankSyncLog),
      );
      rotationRedis = rotationApp.get<Redis>(REDIS_CLIENT);
    });

    afterAll(async () => {
      delete process.env.TOKEN_ENCRYPTION_KEY_PREV;
      await rotationApp.close();
    });

    it('decrypts and syncs a connection whose token was encrypted under the previous key', async () => {
      const created = await connectionRepo.save(
        connectionRepo.create({
          householdId: H,
          provider: BankProvider.MONOBANK,
          tokenEncrypted: encryptSecret('mono-token-pre-rotation', OLD_KEY),
          monobankClientId: 'mono-client-1',
          lastSyncAt: null,
          status: BankConnectionStatus.ACTIVE,
        }),
      );
      await accountRepo.save(
        accountRepo.create({
          connectionId: created.id,
          monobankAccountId: 'acc-1',
          kind: BankAccountKind.ACCOUNT,
          maskedPan: '444455******1234',
          syncEnabled: true,
          lastSyncAt: null,
        }),
      );

      const res = await request(rotationApp.getHttpServer())
        .post(`/monobank/connections/${created.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);

      // A single-account run always takes two ticks: one to sync the
      // account, one more to notice nothing is left due and finalize — see
      // the comment on SyncScheduler.advanceRun's "no account left" branch.
      let finished = await rotationSyncLogRepo.findOneOrFail({
        where: { id: res.body.id },
      });
      for (
        let i = 0;
        i < 5 && finished.status !== 'success' && finished.status !== 'failed';
        i++
      ) {
        const lockKeys = await rotationRedis.keys('sync:lock:*');
        if (lockKeys.length > 0) await rotationRedis.del(...lockKeys);
        await rotationScheduler.advanceRun(finished);
        finished = await rotationSyncLogRepo.findOneOrFail({
          where: { id: res.body.id },
        });
      }

      expect(finished.status).toBe('success');
      expect(rotationMonobank.receivedToken).toBe('mono-token-pre-rotation');
    });
  });

  describe('feature flag: monobank-integration (kill-switch)', () => {
    // No household-service is running in this test app, so a cache MISS
    // always falls back to the registry default (true) — see
    // FeatureFlagService.isEnabled. Pre-populating the Redis cache directly
    // (same technique the sync:lock: tests above use) is what lets these
    // tests force the "disabled" state without a live household-service.
    // Every request here carries X-Household-Id, so the household-scoped key
    // needs seeding too ('none' = cached "no override") — leaving it unset
    // would itself read back as a miss and trigger a live (failing) fetch
    // that falls back to the registry default (true), masking the flag-off
    // behavior this test is meant to exercise.
    async function disableFlag() {
      await redis.set('flag:monobank-integration:default', '0', 'EX', 60);
      await redis.set(
        `flag:monobank-integration:household:${H}`,
        'none',
        'EX',
        60,
      );
    }

    it('503s POST /monobank/connect while disabled', async () => {
      await disableFlag();
      await connect().expect(503);
    });

    it('503s POST /monobank/connections/:id/sync while disabled', async () => {
      const created = await connect();
      await disableFlag();

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(503);
    });

    it('still allows read/disconnect endpoints while disabled', async () => {
      const created = await connect();
      await disableFlag();

      await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H)
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/monobank/connections/${created.body.id}`)
        .set('X-Household-Id', H)
        .expect(204);
    });

    it('the scheduler does no work while disabled', async () => {
      const created = await connect();
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);

      await disableFlag();
      await scheduler.advancePendingSyncs();

      const logs = await request(app.getHttpServer())
        .get(`/monobank/connections/${created.body.id}/logs`)
        .set('X-Household-Id', H);
      expect(logs.body[0]).toMatchObject({ status: 'queued', accountsDone: 0 });
    });

    it('resumes normal operation once the flag is re-enabled', async () => {
      const created = await connect();
      await disableFlag();
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(503);

      await redis.set('flag:monobank-integration:default', '1', 'EX', 60);

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(202);
    });
  });
});
