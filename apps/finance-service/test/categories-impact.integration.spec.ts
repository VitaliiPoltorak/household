import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

async function createCategory(app: INestApplication, name = 'Groceries', householdId = H): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/categories')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ name, type: 'expense' });
  return res.body.id as string;
}

async function createSubcategory(app: INestApplication, parentId: string, name = 'Sub'): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/categories')
    .set('X-User-Id', U).set('X-Household-Id', H)
    .send({ name, type: 'expense', parentId });
  return res.body.id as string;
}

async function createAccount(app: INestApplication, householdId = H): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/accounts')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ name: 'Bank', type: 'bank', currency: 'UAH' });
  return res.body.id as string;
}

async function createTx(
  app: INestApplication,
  accountId: string,
  categoryId: string,
  amount = 100,
  householdId = H,
): Promise<void> {
  await request(app.getHttpServer())
    .post('/transactions')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ accountId, categoryId, type: 'expense', amount, currency: 'UAH', date: '2026-07-30' });
}

async function createRecurring(
  app: INestApplication,
  categoryId: string,
  householdId = H,
): Promise<void> {
  await request(app.getHttpServer())
    .post('/recurring-payments')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ name: 'Netflix', amount: 200, categoryId, frequency: 'monthly', nextDueDate: '2026-09-01' });
}

describe('GET /categories/:id/impact (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => { await cleanDatabase(app); resetKafkaMocks(); });
  afterAll(async () => { await app.close(); });

  it('returns zero counts for an unused category', async () => {
    const categoryId = await createCategory(app);

    const res = await request(app.getHttpServer())
      .get(`/categories/${categoryId}/impact`).set('X-Household-Id', H).expect(200);

    expect(res.body).toEqual({
      categoryId,
      transactions: 0,
      recurringPayments: 0,
      subcategories: 0,
      lastUsedAt: null,
    });
  });

  it('counts referring transactions and reports the latest lastUsedAt', async () => {
    const categoryId = await createCategory(app);
    const accountId = await createAccount(app);

    await createTx(app, accountId, categoryId, 100);
    await createTx(app, accountId, categoryId, 200);
    await createTx(app, accountId, categoryId, 300);

    const res = await request(app.getHttpServer())
      .get(`/categories/${categoryId}/impact`).set('X-Household-Id', H).expect(200);

    expect(res.body.transactions).toBe(3);
    expect(res.body.lastUsedAt).not.toBeNull();
    expect(new Date(res.body.lastUsedAt).getTime()).toBeGreaterThan(0);
  });

  it('counts recurring payments independently from transactions', async () => {
    const categoryId = await createCategory(app);
    await createRecurring(app, categoryId);
    await createRecurring(app, categoryId);

    const res = await request(app.getHttpServer())
      .get(`/categories/${categoryId}/impact`).set('X-Household-Id', H).expect(200);

    expect(res.body.recurringPayments).toBe(2);
    expect(res.body.transactions).toBe(0);
    expect(res.body.lastUsedAt).toBeNull();
  });

  it('counts subcategories (rows with parentId = target)', async () => {
    const parentId = await createCategory(app, 'Food');
    await createSubcategory(app, parentId, 'Fruit');
    await createSubcategory(app, parentId, 'Meat');

    const res = await request(app.getHttpServer())
      .get(`/categories/${parentId}/impact`).set('X-Household-Id', H).expect(200);

    expect(res.body.subcategories).toBe(2);
  });

  it('does not leak counts from another household', async () => {
    const categoryId = await createCategory(app);
    const foreignAccount = await createAccount(app, 'other-household');
    // Craft a foreign transaction with the same categoryId. In practice
    // #62's ownership check would 404 this, but the point of this test is:
    // if such a row ever existed, impact must not count it.
    await request(app.getHttpServer())
      .post('/transactions')
      .set('X-User-Id', U).set('X-Household-Id', 'other-household')
      .send({ accountId: foreignAccount, type: 'expense', amount: 500, currency: 'UAH', date: '2026-07-30' });

    const res = await request(app.getHttpServer())
      .get(`/categories/${categoryId}/impact`).set('X-Household-Id', H).expect(200);

    expect(res.body.transactions).toBe(0);
  });

  it('returns 404 for a category from another household', async () => {
    const foreignCategoryId = await createCategory(app, 'Theirs', 'other-household');

    await request(app.getHttpServer())
      .get(`/categories/${foreignCategoryId}/impact`).set('X-Household-Id', H).expect(404);
  });
});
