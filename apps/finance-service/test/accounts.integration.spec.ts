import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import { AppModule } from '../src/app.module';

describe('Accounts (integration)', () => {
  let app: INestApplication;
  const H = 'test-household-id';
  const U = 'test-user-id';

  beforeAll(async () => {
    app = await createTestApp(AppModule);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /accounts', () => {
    it('creates account with zero balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Mono Card', type: 'bank', currency: 'UAH' })
        .expect(201);

      expect(res.body.name).toBe('Mono Card');
      expect(Number(res.body.balance)).toBe(0);
      expect(res.body.isArchived).toBe(false);
      expect(res.body.householdId).toBe(H);
    });

    it('emits finance.account.created to Kafka', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Cash', type: 'cash' })
        .expect(201);

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'finance.account.created',
        expect.objectContaining({ householdId: H }),
        expect.objectContaining({ userId: U, householdId: H }),
      );
    });

    it('rejects missing X-Household-Id', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .send({ name: 'Bad', type: 'bank' })
        .expect(401);
    });

    it('rejects unknown account type', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Bad', type: 'unknown' })
        .expect(400);
    });
  });

  describe('GET /accounts', () => {
    it('returns only non-archived accounts for household', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'A', type: 'bank' });
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .send({ name: 'B', type: 'cash' });

      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('A');
    });
  });

  describe('GET /accounts/summary', () => {
    it('returns zero totalBalance for empty household', async () => {
      const res = await request(app.getHttpServer())
        .get('/accounts/summary')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(res.body.totalBalance).toBe(0);
      expect(res.body.accounts).toEqual([]);
    });

    it('sums account balances with DECIMAL precision (no float drift)', async () => {
      // 0.10 + 0.20 + 0.10 in JS float = 0.4000000000000001. In SQL DECIMAL it's 0.40.
      const values = [0.10, 0.20, 0.10];
      for (let i = 0; i < values.length; i++) {
        const acc = await request(app.getHttpServer())
          .post('/accounts')
          .set('X-User-Id', U).set('X-Household-Id', H)
          .send({ name: `Acc${i}`, type: 'bank', currency: 'UAH' });
        await request(app.getHttpServer())
          .post('/transactions')
          .set('X-User-Id', U).set('X-Household-Id', H)
          .send({ accountId: acc.body.id, type: 'income', amount: values[i], currency: 'UAH', date: '2026-07-30' });
      }

      const summary = await request(app.getHttpServer())
        .get('/accounts/summary')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(summary.body.totalBalance).toBe(0.4);
      expect(summary.body.accounts).toHaveLength(3);
    });
  });

  describe('DELETE /accounts/:id', () => {
    it('archives account instead of deleting', async () => {
      const created = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'To Archive', type: 'cash' });

      await request(app.getHttpServer())
        .delete(`/accounts/${created.body.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(list.body).toHaveLength(0); // not returned because isArchived=true
    });
  });

  describe('POST /accounts/:id/adjust-balance', () => {
    const seedAccountWithBalance = async (start: number) => {
      const account = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'Cash', type: 'cash' });

      if (start !== 0) {
        await request(app.getHttpServer())
          .post('/transactions')
          .set('X-User-Id', U).set('X-Household-Id', H)
          .send({
            accountId: account.body.id,
            type: 'income',
            amount: start,
            date: '2026-08-01',
          });
      }
      return account.body.id;
    };

    it('increases balance and creates positive ADJUSTMENT transaction', async () => {
      const id = await seedAccountWithBalance(10000);
      resetKafkaMocks();

      const res = await request(app.getHttpServer())
        .post(`/accounts/${id}/adjust-balance`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ newBalance: 11000, description: 'Found cash' })
        .expect(201);

      expect(res.body.type).toBe('adjustment');
      expect(Number(res.body.amount)).toBe(1000);

      const account = await request(app.getHttpServer())
        .get(`/accounts/${id}`)
        .set('X-User-Id', U).set('X-Household-Id', H);
      expect(Number(account.body.balance)).toBe(11000);

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'finance.transaction.created',
        expect.objectContaining({ householdId: H }),
        expect.objectContaining({ userId: U, householdId: H }),
      );
    });

    it('decreases balance and creates negative ADJUSTMENT transaction', async () => {
      const id = await seedAccountWithBalance(10000);

      const res = await request(app.getHttpServer())
        .post(`/accounts/${id}/adjust-balance`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ newBalance: 9000 })
        .expect(201);

      expect(Number(res.body.amount)).toBe(-1000);

      const account = await request(app.getHttpServer())
        .get(`/accounts/${id}`)
        .set('X-User-Id', U).set('X-Household-Id', H);
      expect(Number(account.body.balance)).toBe(9000);
    });

    it('rejects when newBalance equals current balance', async () => {
      const id = await seedAccountWithBalance(10000);

      await request(app.getHttpServer())
        .post(`/accounts/${id}/adjust-balance`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ newBalance: 10000 })
        .expect(400);
    });

    it('rejects cross-household access', async () => {
      const id = await seedAccountWithBalance(500);

      await request(app.getHttpServer())
        .post(`/accounts/${id}/adjust-balance`)
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .send({ newBalance: 1000 })
        .expect(404);
    });
  });
});
