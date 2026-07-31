import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

async function post(app: INestApplication, path: string, body: object) {
  return request(app.getHttpServer())
    .post(path)
    .set('X-User-Id', U).set('X-Household-Id', H)
    .send(body);
}

describe('Reports (integration)', () => {
  let app: INestApplication;
  let accountId: string;
  let cat1Id: string;
  let cat2Id: string;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    // Create account
    const acct = await post(app, '/accounts', { name: 'Bank', type: 'bank', currency: 'UAH' });
    accountId = acct.body.id;
    // Create categories
    cat1Id = (await post(app, '/categories', { name: 'Food', type: 'expense' })).body.id;
    cat2Id = (await post(app, '/categories', { name: 'Transport', type: 'expense' })).body.id;
  });
  afterAll(async () => { await app.close(); });

  describe('GET /reports/monthly', () => {
    it('sums income and expense by day', async () => {
      await post(app, '/transactions', { accountId, type: 'income', amount: 5000, currency: 'UAH', date: '2026-07-10' });
      await post(app, '/transactions', { accountId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-15' });
      await post(app, '/transactions', { accountId, type: 'expense', amount: 800, currency: 'UAH', date: '2026-07-10' });

      const res = await request(app.getHttpServer())
        .get('/reports/monthly?year=2026&month=7')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body.period).toBe('2026-07');
      expect(res.body.totalIncome).toBeCloseTo(7000);
      expect(res.body.totalExpense).toBeCloseTo(800);
      expect(res.body.net).toBeCloseTo(6200);
      expect(res.body.byDay).toHaveLength(2); // two distinct dates
    });

    it('returns empty byDay for month with no transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/monthly?year=2025&month=1')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body.totalIncome).toBe(0);
      expect(res.body.totalExpense).toBe(0);
      expect(res.body.byDay).toHaveLength(0);
    });

    it('excludes transfers from totals', async () => {
      await post(app, '/transactions', { accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-01' });
      // adjustment should also be excluded (not income or expense)
      await post(app, '/transactions', { accountId, type: 'adjustment', amount: 500, currency: 'UAH', date: '2026-07-01' });

      const res = await request(app.getHttpServer())
        .get('/reports/monthly?year=2026&month=7')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body.totalIncome).toBeCloseTo(1000);
      expect(res.body.totalExpense).toBeCloseTo(0);
    });
  });

  describe('GET /reports/by-category', () => {
    it('groups expenses by category with totals', async () => {
      await post(app, '/transactions', {
        accountId, type: 'expense', amount: 300, currency: 'UAH', date: '2026-07-05', categoryId: cat1Id,
      });
      await post(app, '/transactions', {
        accountId, type: 'expense', amount: 150, currency: 'UAH', date: '2026-07-10', categoryId: cat1Id,
      });
      await post(app, '/transactions', {
        accountId, type: 'expense', amount: 200, currency: 'UAH', date: '2026-07-12', categoryId: cat2Id,
      });

      const res = await request(app.getHttpServer())
        .get('/reports/by-category?from=2026-07-01&to=2026-07-31&type=expense')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(2);
      const food = res.body.find((r: { categoryId: string }) => r.categoryId === cat1Id);
      expect(food.total).toBeCloseTo(450);
      expect(food.count).toBe(2);
      expect(food.categoryName).toBe('Food');
    });

    it('includes null category for uncategorized transactions', async () => {
      await post(app, '/transactions', { accountId, type: 'expense', amount: 100, currency: 'UAH', date: '2026-07-01' });

      const res = await request(app.getHttpServer())
        .get('/reports/by-category?from=2026-07-01&to=2026-07-31&type=expense')
        .set('X-Household-Id', H)
        .expect(200);

      const uncategorized = res.body.find((r: { categoryId: null }) => r.categoryId === null);
      expect(uncategorized).toBeDefined();
      expect(uncategorized.total).toBeCloseTo(100);
      expect(uncategorized.categoryName).toBeNull();
    });

    it('filters by date range', async () => {
      await post(app, '/transactions', { accountId, type: 'expense', amount: 500, currency: 'UAH', date: '2026-06-15', categoryId: cat1Id });
      await post(app, '/transactions', { accountId, type: 'expense', amount: 200, currency: 'UAH', date: '2026-07-15', categoryId: cat1Id });

      const res = await request(app.getHttpServer())
        .get('/reports/by-category?from=2026-07-01&to=2026-07-31&type=expense')
        .set('X-Household-Id', H)
        .expect(200);

      const food = res.body.find((r: { categoryId: string }) => r.categoryId === cat1Id);
      expect(food.total).toBeCloseTo(200); // only July
    });
  });

  describe('GET /reports/net-worth', () => {
    it('sums balances across all accounts', async () => {
      const acct2 = await post(app, '/accounts', { name: 'Cash', type: 'cash', currency: 'UAH' });
      await post(app, '/transactions', { accountId, type: 'income', amount: 3000, currency: 'UAH', date: '2026-07-01' });
      await post(app, '/transactions', { accountId: acct2.body.id, type: 'income', amount: 500, currency: 'UAH', date: '2026-07-01' });

      const res = await request(app.getHttpServer())
        .get('/reports/net-worth')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body.totalBalance).toBeCloseTo(3500);
      expect(res.body.byCurrency['UAH']).toBeCloseTo(3500);
      expect(res.body.accounts).toHaveLength(2);
    });

    it('groups by currency', async () => {
      const usdAcct = await post(app, '/accounts', { name: 'USD Savings', type: 'bank', currency: 'USD' });
      await post(app, '/transactions', { accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-01' });
      await post(app, '/transactions', { accountId: usdAcct.body.id, type: 'income', amount: 100, currency: 'USD', date: '2026-07-01' });

      const res = await request(app.getHttpServer())
        .get('/reports/net-worth')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body.byCurrency['UAH']).toBeCloseTo(1000);
      expect(res.body.byCurrency['USD']).toBeCloseTo(100);
    });

    it('excludes archived accounts', async () => {
      await post(app, '/transactions', { accountId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-01' });
      await request(app.getHttpServer()).delete(`/accounts/${accountId}`).set('X-Household-Id', H);

      const res = await request(app.getHttpServer())
        .get('/reports/net-worth')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body.accounts).toHaveLength(0);
      expect(res.body.totalBalance).toBe(0);
    });
  });
});
