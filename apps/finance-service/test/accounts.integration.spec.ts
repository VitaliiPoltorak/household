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
});
