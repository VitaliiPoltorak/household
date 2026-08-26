import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
} from '@household/testing';
import { AppModule } from '../src/app.module';

describe('Account Types (integration, #227)', () => {
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

  describe('GET /account-types', () => {
    it('returns the 5 system-seeded types', async () => {
      const res = await request(app.getHttpServer())
        .get('/account-types')
        .expect(200);

      const codes = res.body.map((t: { code: string }) => t.code);
      expect(codes.sort()).toEqual([
        'bank',
        'cash',
        'crypto',
        'deposit',
        'investment',
      ]);
      expect(
        res.body.every((t: { isSystem: boolean }) => t.isSystem === true),
      ).toBe(true);
    });
  });

  describe('GET /account-types/enabled', () => {
    it('lazily seeds and returns the default set for a never-touched household', async () => {
      const res = await request(app.getHttpServer())
        .get('/account-types/enabled')
        .set('X-Household-Id', H)
        .expect(200);

      const codes = res.body.map((t: { typeCode: string }) => t.typeCode);
      expect(codes.sort()).toEqual([
        'bank',
        'cash',
        'crypto',
        'deposit',
        'investment',
      ]);
      expect(res.body[0].accountType).toBeDefined();
    });

    it('rejects missing X-Household-Id', async () => {
      await request(app.getHttpServer())
        .get('/account-types/enabled')
        .expect(401);
    });
  });

  describe('POST /account-types/enabled', () => {
    it('enables an existing catalog type without a label', async () => {
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'CRYPTO' }) // uppercase — DTO lowercases it
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/account-types/enabled')
        .set('X-Household-Id', H)
        .expect(200);
      expect(res.body.map((t: { typeCode: string }) => t.typeCode)).toContain(
        'crypto',
      );
    });

    it('creates and enables a brand-new custom type when label is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'paypal', label: 'PayPal' })
        .expect(201);
      expect(res.body.typeCode).toBe('paypal');

      const catalog = await request(app.getHttpServer())
        .get('/account-types')
        .expect(200);
      const paypal = catalog.body.find(
        (t: { code: string }) => t.code === 'paypal',
      );
      expect(paypal).toBeDefined();
      expect(paypal.isSystem).toBe(false);
      expect(paypal.label).toBe('PayPal');
    });

    it('rejects an unknown code without a label', async () => {
      const res = await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'unknown-type' })
        .expect(400);
      expect(res.body.message).toContain('unknown-type');
    });

    it('rejects an invalid code shape (uppercase/spaces rejected before normalization by regex on raw chars)', async () => {
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'not a valid code!', label: 'Bad' })
        .expect(400);
    });

    it('a second household enabling the same custom code reuses the existing catalog entry', async () => {
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'paypal', label: 'PayPal' })
        .expect(201);

      // Second household enables the same code with NO label — succeeds because
      // the catalog entry from household H already exists.
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', 'other-household')
        .send({ code: 'paypal' })
        .expect(201);

      const catalog = await request(app.getHttpServer())
        .get('/account-types')
        .expect(200);
      expect(
        catalog.body.filter((t: { code: string }) => t.code === 'paypal'),
      ).toHaveLength(1);
    });

    it('is idempotent — enabling an already-enabled type does not error', async () => {
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'bank' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'bank' })
        .expect(201);
    });
  });

  describe('DELETE /account-types/enabled/:code', () => {
    it('disables an unused type', async () => {
      await request(app.getHttpServer())
        .get('/account-types/enabled')
        .set('X-Household-Id', H); // trigger lazy seed

      await request(app.getHttpServer())
        .delete('/account-types/enabled/deposit')
        .set('X-Household-Id', H)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/account-types/enabled')
        .set('X-Household-Id', H)
        .expect(200);
      expect(
        res.body.map((t: { typeCode: string }) => t.typeCode),
      ).not.toContain('deposit');
    });

    it('rejects disabling a type with active accounts (409 + impact)', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Wallet', type: 'crypto', currency: 'USD' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete('/account-types/enabled/crypto')
        .set('X-Household-Id', H)
        .expect(409);

      expect(res.body.message).toContain('Cannot disable');
      expect(res.body).toMatchObject({
        impact: { code: 'crypto', accounts: 1 },
      });
    });
  });

  describe('Account type validation (#227)', () => {
    it('accepts creating an account with a default-enabled type', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Card', type: 'bank', currency: 'UAH' })
        .expect(201);
    });

    it('rejects creating an account with a type not enabled for the household', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'PayPal Account', type: 'paypal', currency: 'USD' })
        .expect(400);
      expect(res.body.message).toContain('paypal');
    });

    it('accepts an account with a custom type once the household enables it', async () => {
      await request(app.getHttpServer())
        .post('/account-types/enabled')
        .set('X-Household-Id', H)
        .send({ code: 'paypal', label: 'PayPal' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'PayPal Account', type: 'paypal', currency: 'USD' })
        .expect(201);
      expect(res.body.type).toBe('paypal');
    });

    it('rejects updating an account to a type not enabled for the household', async () => {
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
        .send({ type: 'paypal' })
        .expect(400);
    });

    it('lowercases a mixed-case type on create', async () => {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Card', type: 'Bank', currency: 'UAH' })
        .expect(201);
      expect(res.body.type).toBe('bank');
    });
  });
});
