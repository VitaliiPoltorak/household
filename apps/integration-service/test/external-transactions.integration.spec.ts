import { BadRequestException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
} from '@household/testing';
import { AppModule } from '../src/app.module';
import {
  MonobankClientService,
  type MonobankClientInfo,
  type MonobankStatementItem,
} from '../src/monobank/monobank-client.service';
import {
  FinanceClientService,
  type CreateFinanceTransactionPayload,
} from '../src/external-transactions/finance-client.service';

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

  async getClientInfo(): Promise<MonobankClientInfo> {
    return this.clientInfo;
  }

  async getStatement(): Promise<MonobankStatementItem[]> {
    return this.statementItems;
  }
}

class FakeFinanceClient {
  calls: CreateFinanceTransactionPayload[] = [];
  shouldFail = false;

  async createTransaction(
    _context: { userId: string; householdId: string },
    payload: CreateFinanceTransactionPayload,
  ): Promise<{ id: string }> {
    this.calls.push(payload);
    if (this.shouldFail)
      throw new BadRequestException('finance-service rejected the request');
    return { id: `finance-tx-${this.calls.length}` };
  }
}

const H = 'test-household-id';
const U = 'test-user-id';

describe('External transactions (integration)', () => {
  let app: INestApplication;
  let fakeFinance: FakeFinanceClient;

  beforeAll(async () => {
    fakeFinance = new FakeFinanceClient();
    app = await createTestApp(AppModule, (b) =>
      b
        .overrideProvider(MonobankClientService)
        .useValue(new FakeMonobankClient())
        .overrideProvider(FinanceClientService)
        .useValue(fakeFinance),
    );
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    fakeFinance.calls = [];
    fakeFinance.shouldFail = false;
  });

  afterAll(async () => {
    await app.close();
  });

  async function connectAndSync(householdId = H): Promise<string> {
    const connection = await request(app.getHttpServer())
      .post('/monobank/connect')
      .set('X-Household-Id', householdId)
      .send({ token: 'mono-token-abc' });
    await request(app.getHttpServer())
      .post(`/monobank/connections/${connection.body.id}/sync`)
      .set('X-Household-Id', householdId);
    return connection.body.id as string;
  }

  function getUnmapped(householdId = H) {
    return request(app.getHttpServer())
      .get('/monobank/transactions')
      .set('X-Household-Id', householdId);
  }

  describe('GET /monobank/transactions', () => {
    it('returns unmapped transactions parsed from the raw statement item', async () => {
      await connectAndSync();

      const res = await getUnmapped().expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        externalId: 'tx-1',
        description: 'Coffee',
        mcc: 5814,
        amount: -50,
        currency: 'UAH',
        suggestedCategoryName: 'Restaurants',
        mappedTransactionId: null,
      });
    });

    it('does not return transactions from another household', async () => {
      await connectAndSync(H);

      const res = await getUnmapped('other-household').expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('rejects without X-Household-Id', async () => {
      await request(app.getHttpServer())
        .get('/monobank/transactions')
        .expect(401);
    });

    it('returns 404 when filtered by a connection in another household', async () => {
      const connectionId = await connectAndSync(H);

      await request(app.getHttpServer())
        .get('/monobank/transactions')
        .query({ connectionId })
        .set('X-Household-Id', 'other-household')
        .expect(404);
    });
  });

  describe('POST /monobank/transactions/:id/map', () => {
    it('creates the finance transaction and marks the external transaction mapped', async () => {
      await connectAndSync();
      const [unmapped] = (await getUnmapped()).body;

      const res = await request(app.getHttpServer())
        .post(`/monobank/transactions/${unmapped.id}/map`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({
          accountId: 'finance-account-1',
          categoryId: 'finance-category-1',
        })
        .expect(201);

      expect(res.body.mappedTransactionId).toBe('finance-tx-1');
      expect(fakeFinance.calls).toHaveLength(1);
      expect(fakeFinance.calls[0]).toMatchObject({
        accountId: 'finance-account-1',
        type: 'expense',
        amount: 50,
        currency: 'UAH',
        categoryId: 'finance-category-1',
        description: 'Coffee',
        externalId: 'monobank:tx-1',
      });

      expect((await getUnmapped()).body).toHaveLength(0);
    });

    it('rejects mapping an already-mapped transaction', async () => {
      await connectAndSync();
      const [unmapped] = (await getUnmapped()).body;

      await request(app.getHttpServer())
        .post(`/monobank/transactions/${unmapped.id}/map`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ accountId: 'finance-account-1' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/monobank/transactions/${unmapped.id}/map`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ accountId: 'finance-account-1' })
        .expect(409);
    });

    it('returns 404 for a transaction in another household', async () => {
      await connectAndSync(H);
      const [unmapped] = (await getUnmapped(H)).body;

      await request(app.getHttpServer())
        .post(`/monobank/transactions/${unmapped.id}/map`)
        .set('X-User-Id', U)
        .set('X-Household-Id', 'other-household')
        .send({ accountId: 'finance-account-1' })
        .expect(404);
    });

    it('rejects without X-User-Id', async () => {
      await connectAndSync();
      const [unmapped] = (await getUnmapped()).body;

      await request(app.getHttpServer())
        .post(`/monobank/transactions/${unmapped.id}/map`)
        .set('X-Household-Id', H)
        .send({ accountId: 'finance-account-1' })
        .expect(401);
    });

    it('propagates a finance-service rejection as 400', async () => {
      await connectAndSync();
      const [unmapped] = (await getUnmapped()).body;
      fakeFinance.shouldFail = true;

      await request(app.getHttpServer())
        .post(`/monobank/transactions/${unmapped.id}/map`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ accountId: 'bad-account' })
        .expect(400);
    });
  });
});
