import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
} from '@household/testing';
import { AppModule } from '../src/app.module';

describe('Currencies (integration, #226)', () => {
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

  describe('GET /currencies', () => {
    it('returns the global catalog seeded at boot', async () => {
      const res = await request(app.getHttpServer())
        .get('/currencies')
        .expect(200);

      const codes = res.body.map((c: { code: string }) => c.code);
      expect(codes).toEqual(expect.arrayContaining(['UAH', 'USD', 'EUR']));
    });
  });

  describe('GET /currencies/enabled', () => {
    it('lazily seeds and returns the default set for a never-touched household', async () => {
      const res = await request(app.getHttpServer())
        .get('/currencies/enabled')
        .set('X-Household-Id', H)
        .expect(200);

      const codes = res.body.map(
        (c: { currencyCode: string }) => c.currencyCode,
      );
      expect(codes.sort()).toEqual(['EUR', 'UAH', 'USD']);
      expect(res.body[0].currency).toBeDefined();
    });

    it('rejects missing X-Household-Id', async () => {
      await request(app.getHttpServer()).get('/currencies/enabled').expect(401);
    });
  });

  describe('POST /currencies/enabled', () => {
    it('enables a known catalog currency for the household', async () => {
      await request(app.getHttpServer())
        .post('/currencies/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'usd' }) // lowercase — DTO uppercases it
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/currencies/enabled')
        .set('X-Household-Id', H)
        .expect(200);
      expect(
        res.body.map((c: { currencyCode: string }) => c.currencyCode),
      ).toContain('USD');
    });

    it('rejects an unknown currency code', async () => {
      await request(app.getHttpServer())
        .post('/currencies/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'ZZZ' })
        .expect(400);
    });

    it('is idempotent — enabling an already-enabled currency does not error', async () => {
      await request(app.getHttpServer())
        .post('/currencies/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'UAH' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/currencies/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'UAH' })
        .expect(201);
    });
  });

  describe('DELETE /currencies/enabled/:code', () => {
    it('disables an unused currency', async () => {
      await request(app.getHttpServer())
        .get('/currencies/enabled')
        .set('X-Household-Id', H); // trigger lazy seed

      await request(app.getHttpServer())
        .delete('/currencies/enabled/EUR')
        .set('X-Household-Id', H)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/currencies/enabled')
        .set('X-Household-Id', H)
        .expect(200);
      expect(
        res.body.map((c: { currencyCode: string }) => c.currencyCode),
      ).not.toContain('EUR');
    });

    it('rejects disabling a currency with active accounts (409 + impact)', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Savings', type: 'bank', currency: 'USD' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete('/currencies/enabled/USD')
        .set('X-Household-Id', H)
        .expect(409);

      expect(res.body.message).toContain('Cannot disable');
      expect(res.body).toMatchObject({
        impact: { code: 'USD', accounts: 1 },
      });
    });
  });

  describe('Account currency validation (#226)', () => {
    it('accepts creating an account with a default-enabled currency', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Card', type: 'bank', currency: 'EUR' })
        .expect(201);
    });

    it('rejects creating an account with a currency not enabled for the household', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Crypto Wallet', type: 'crypto', currency: 'BTC' })
        .expect(400);

      expect(res.body.message).toContain('BTC');
    });

    it('rejects updating an account to a currency not enabled for the household', async () => {
      const created = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Card', type: 'bank', currency: 'UAH' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/accounts/${created.body.id}`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ currency: 'BTC' })
        .expect(400);
    });

    it('uppercases a lowercase currency on create', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Card', type: 'bank', currency: 'usd' })
        .expect(201);

      expect(res.body.currency).toBe('USD');
    });
  });
});
