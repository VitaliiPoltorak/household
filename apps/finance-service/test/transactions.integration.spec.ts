import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

async function createAccount(
  app: INestApplication,
  name: string,
  type = 'bank',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/accounts')
    .set('X-User-Id', U).set('X-Household-Id', H)
    .send({ name, type, currency: 'UAH' });
  return res.body.id as string;
}

async function getBalance(app: INestApplication, accountId: string): Promise<number> {
  const res = await request(app.getHttpServer())
    .get(`/accounts/${accountId}`)
    .set('X-Household-Id', H);
  return Number(res.body.balance);
}

describe('Transactions (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => { await app.close(); });

  describe('POST /transactions — income', () => {
    it('increases account balance', async () => {
      const accountId = await createAccount(app, 'Bank');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 5000, currency: 'UAH', date: '2026-07-30' })
        .expect(201);

      expect(await getBalance(app, accountId)).toBe(5000);
    });

    it('emits finance.transaction.created', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'finance.transaction.created',
        expect.objectContaining({ householdId: H }),
        expect.any(Object),
      );
    });
  });

  describe('POST /transactions — expense', () => {
    it('decreases account balance', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 300, currency: 'UAH', date: '2026-07-30' })
        .expect(201);

      expect(await getBalance(app, accountId)).toBe(700);
    });
  });

  describe('POST /transactions/transfer', () => {
    it('moves amount between accounts, net balance unchanged', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });

      const res = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' })
        .expect(201);

      const [debit, credit] = res.body as Array<{ transferPairId: string }>;
      expect(debit.transferPairId).toBe(credit.transferPairId);
      expect(await getBalance(app, fromId)).toBe(1500);
      expect(await getBalance(app, toId)).toBe(500);

      const summary = await request(app.getHttpServer())
        .get('/accounts/summary')
        .set('X-Household-Id', H);
      expect(summary.body.totalBalance).toBe(2000);
    });
  });

  describe('DELETE /transactions/:id', () => {
    it('reverses balance on delete of income', async () => {
      const accountId = await createAccount(app, 'Bank');
      const tx = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 3000, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .delete(`/transactions/${tx.body.id}`)
        .set('X-Household-Id', H)
        .expect(204);

      expect(await getBalance(app, accountId)).toBe(0);
    });

    it('reverses balance on delete of expense', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });
      const expense = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 400, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .delete(`/transactions/${expense.body.id}`)
        .set('X-Household-Id', H)
        .expect(204);

      expect(await getBalance(app, accountId)).toBe(1000);
    });
  });

  describe('GET /transactions filters', () => {
    it('filters by type', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 500, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 200, currency: 'UAH', date: '2026-07-30' });

      const res = await request(app.getHttpServer())
        .get('/transactions?type=income')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body.every((t: { type: string }) => t.type === 'income')).toBe(true);
    });

    it('filters by date range', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 100, currency: 'UAH', date: '2026-06-15' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 200, currency: 'UAH', date: '2026-07-15' });

      const res = await request(app.getHttpServer())
        .get('/transactions?from=2026-07-01&to=2026-07-31')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe('2026-07-15');
    });
  });

  describe('Validation', () => {
    it('rejects negative amount', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: -100, currency: 'UAH', date: '2026-07-30' })
        .expect(400);
    });

    it('rejects transaction type "transfer" via POST /transactions', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'transfer', amount: 100, currency: 'UAH', date: '2026-07-30' })
        .expect(400);
    });
  });
});
