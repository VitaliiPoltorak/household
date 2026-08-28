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

class FakeMonobankClient {
  clientInfo: MonobankClientInfo = {
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
  statementItems: MonobankStatementItem[] = [
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
  ];
  shouldFailClientInfo = false;
  shouldFailStatement = false;

  async getClientInfo(): Promise<MonobankClientInfo> {
    if (this.shouldFailClientInfo) {
      throw new UnauthorizedException('Invalid or revoked Monobank token');
    }
    return this.clientInfo;
  }

  async getStatement(): Promise<MonobankStatementItem[]> {
    if (this.shouldFailStatement) {
      throw new BadGatewayException('Monobank request failed (500)');
    }
    return this.statementItems;
  }
}

const H = 'test-household-id';

describe('Bank connections (integration)', () => {
  let app: INestApplication;
  let fakeMonobank: FakeMonobankClient;
  let redis: Redis;

  beforeAll(async () => {
    fakeMonobank = new FakeMonobankClient();
    app = await createTestApp(AppModule, (b) =>
      b.overrideProvider(MonobankClientService).useValue(fakeMonobank),
    );
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    fakeMonobank.shouldFailClientInfo = false;
    fakeMonobank.shouldFailStatement = false;
    const lockKeys = await redis.keys('sync:lock:*');
    if (lockKeys.length > 0) await redis.del(...lockKeys);
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

  describe('POST /monobank/connect', () => {
    it('validates the token against Monobank and stores the connection', async () => {
      const res = await connect().expect(201);

      expect(res.body).toMatchObject({
        provider: 'monobank',
        monobankClientId: 'mono-client-1',
        monobankAccountId: 'acc-1',
        maskedPan: '444455******1234',
        status: 'active',
        lastSyncAt: null,
      });
      expect(res.body.token).toBeUndefined();
      expect(res.body.tokenEncrypted).toBeUndefined();
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
    it('fetches the statement, stores external transactions, and emits Kafka events', async () => {
      const created = await connect();

      const res = await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'success',
        transactionsCount: 1,
      });

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'integration.monobank.sync.started',
        { connectionId: created.body.id },
        expect.objectContaining({ householdId: H }),
      );
      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'integration.monobank.sync.completed',
        { connectionId: created.body.id, transactionsCount: 1 },
        expect.objectContaining({ householdId: H }),
      );

      const connections = await request(app.getHttpServer())
        .get('/monobank/connections')
        .set('X-Household-Id', H);
      expect(connections.body[0].lastSyncAt).not.toBeNull();
    });

    it('returns 404 for a connection in another household', async () => {
      const created = await connect();
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', 'other-household')
        .expect(404);
    });

    it('rejects a second sync within 60s of the last one', async () => {
      const created = await connect();
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(409);
    });

    it('rejects a sync while another one holds the lock', async () => {
      const created = await connect();
      await redis.set(`sync:lock:${created.body.id}`, '1', 'EX', 60, 'NX');

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(409);
    });

    it('marks the sync failed and emits sync.failed when Monobank errors', async () => {
      const created = await connect();
      fakeMonobank.shouldFailStatement = true;

      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(502);

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

    it('releases the lock after a failed sync so a retry can proceed', async () => {
      const created = await connect();
      fakeMonobank.shouldFailStatement = true;
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(502);

      fakeMonobank.shouldFailStatement = false;
      await request(app.getHttpServer())
        .post(`/monobank/connections/${created.body.id}/sync`)
        .set('X-Household-Id', H)
        .expect(201);
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

    beforeAll(async () => {
      process.env.TOKEN_ENCRYPTION_KEY_PREV = OLD_KEY;
      rotationMonobank = Object.assign(new FakeMonobankClient(), {
        receivedToken: undefined as string | undefined,
      });
      rotationMonobank.getStatement = async function (
        this: FakeMonobankClient & { receivedToken?: string },
        token: string,
      ) {
        this.receivedToken = token;
        return this.statementItems;
      };
      rotationApp = await createTestApp(AppModule, (b) =>
        b.overrideProvider(MonobankClientService).useValue(rotationMonobank),
      );
      connectionRepo = rotationApp.get<Repository<BankConnection>>(
        getRepositoryToken(BankConnection),
      );
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
          monobankAccountId: 'acc-1',
          maskedPan: '444455******1234',
          accountMappings: {},
          lastSyncAt: null,
          status: BankConnectionStatus.ACTIVE,
        }),
      );

      const res = await request(rotationApp.getHttpServer())
        .post(`/monobank/connections/${created.id}/sync`)
        .set('X-Household-Id', H)
        .expect(201);

      expect(res.body).toMatchObject({ status: 'success' });
      expect(rotationMonobank.receivedToken).toBe('mono-token-pre-rotation');
    });
  });
});
