import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

async function createCategory(
  app: INestApplication,
  name = 'Groceries',
  type: 'income' | 'expense' = 'expense',
  householdId = H,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/categories')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ name, type });
  return res.body.id as string;
}

describe('Categories (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => { await cleanDatabase(app); resetKafkaMocks(); });
  afterAll(async () => { await app.close(); });

  describe('POST /categories', () => {
    it('creates a category with isArchived=false', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Groceries', type: 'expense' })
        .expect(201);

      expect(res.body.name).toBe('Groceries');
      expect(res.body.isArchived).toBe(false);
    });
  });

  // #325: before this, a fresh household had zero categories, no UI could
  // create one, and the transaction dialogs hid the category field precisely
  // because the list was empty — a closed loop.
  describe('default categories for a new household', () => {
    const get = (hid = H, qs = '') =>
      request(app.getHttpServer()).get(`/categories${qs}`).set('X-Household-Id', hid);

    it('seeds a starter set on first read of an empty household', async () => {
      const res = await get().expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      const types = new Set(res.body.map((c: { type: string }) => c.type));
      // Both directions must be covered or half the reports stay empty.
      expect(types).toEqual(new Set(['expense', 'income']));
      expect(res.body.every((c: { isArchived: boolean }) => !c.isArchived)).toBe(true);
    });

    it('does not seed twice', async () => {
      const first = await get().expect(200);
      const second = await get().expect(200);
      expect(second.body).toHaveLength(first.body.length);
    });

    it('seeds each household separately', async () => {
      const mine = await get().expect(200);
      const theirs = await get('other-household').expect(200);

      expect(theirs.body).toHaveLength(mine.body.length);
      const mineIds = new Set(mine.body.map((c: { id: string }) => c.id));
      expect(theirs.body.every((c: { id: string }) => !mineIds.has(c.id))).toBe(true);
    });

    it('does not resurrect defaults a household deliberately archived', async () => {
      const seeded = await get().expect(200);
      for (const cat of seeded.body as Array<{ id: string }>) {
        await request(app.getHttpServer())
          .delete(`/categories/${cat.id}`)
          .set('X-Household-Id', H)
          .expect(204);
      }

      // An empty ACTIVE list must not look like an unseeded household —
      // otherwise the starter set comes back every time it is cleared.
      const after = await get().expect(200);
      expect(after.body).toHaveLength(0);
    });
  });

  describe('name uniqueness', () => {
    it('rejects a duplicate name regardless of casing', async () => {
      await createCategory(app, 'Groceries');
      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: '  gRoCeRiEs ', type: 'expense' })
        .expect(409);
    });

    it('allows the same name for the other type', async () => {
      await createCategory(app, 'Gifts', 'expense');
      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Gifts', type: 'income' })
        .expect(201);
    });

    it('frees the name once the original is archived', async () => {
      const id = await createCategory(app, 'Groceries');
      await request(app.getHttpServer()).delete(`/categories/${id}`).set('X-Household-Id', H);

      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Groceries', type: 'expense' })
        .expect(201);
    });

    it('does not collide across households', async () => {
      await createCategory(app, 'Groceries', 'expense', H);
      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', 'other-household')
        .send({ name: 'Groceries', type: 'expense' })
        .expect(201);
    });

    it('rejects renaming onto an existing name', async () => {
      await createCategory(app, 'Groceries');
      const other = await createCategory(app, 'Transport');

      await request(app.getHttpServer())
        .patch(`/categories/${other}`).set('X-Household-Id', H)
        .send({ name: 'groceries' })
        .expect(409);
    });
  });

  describe('parent validation', () => {
    it('refuses a parent belonging to another household', async () => {
      const foreign = await createCategory(app, 'Theirs', 'expense', 'other-household');

      // 404, not a silent link: writing parentId straight through from the DTO
      // was an IDOR that only became reachable once the UI could create
      // categories at all.
      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Mine', type: 'expense', parentId: foreign })
        .expect(404);
    });

    it('refuses a parent of a different type', async () => {
      const income = await createCategory(app, 'Salary', 'income');
      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Bonus run', type: 'expense', parentId: income })
        .expect(400);
    });

    it('refuses nesting more than one level deep', async () => {
      const top = await createCategory(app, 'Food');
      const sub = await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Groceries', type: 'expense', parentId: top })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Fruit', type: 'expense', parentId: sub.body.id })
        .expect(400);
    });

    it('refuses making a category its own parent', async () => {
      const id = await createCategory(app, 'Food');
      await request(app.getHttpServer())
        .patch(`/categories/${id}`).set('X-Household-Id', H)
        .send({ parentId: id })
        .expect(400);
    });

    it('accepts a valid parent and stores the link', async () => {
      const top = await createCategory(app, 'Food');
      const res = await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Groceries', type: 'expense', parentId: top })
        .expect(201);

      expect(res.body.parentId).toBe(top);
    });

    it('clears the parent when null is sent', async () => {
      const top = await createCategory(app, 'Food');
      const sub = await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Groceries', type: 'expense', parentId: top })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/categories/${sub.body.id}`).set('X-Household-Id', H)
        .send({ parentId: null })
        .expect(200);

      expect(res.body.parentId).toBeNull();
    });
  });

  describe('GET /categories', () => {
    it('returns only non-archived categories by default', async () => {
      const activeId = await createCategory(app, 'Active');
      const archivedId = await createCategory(app, 'Archived');
      await request(app.getHttpServer()).delete(`/categories/${archivedId}`).set('X-Household-Id', H);

      const res = await request(app.getHttpServer()).get('/categories').set('X-Household-Id', H).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(activeId);
    });

    it('returns archived when includeArchived=true', async () => {
      const id = await createCategory(app, 'To Archive');
      await request(app.getHttpServer()).delete(`/categories/${id}`).set('X-Household-Id', H);

      const res = await request(app.getHttpServer())
        .get('/categories?includeArchived=true').set('X-Household-Id', H).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].isArchived).toBe(true);
    });

    it('isolates categories by household', async () => {
      await createCategory(app, 'Mine', 'expense', H);
      await createCategory(app, 'Theirs', 'expense', 'other-household');

      const res = await request(app.getHttpServer()).get('/categories').set('X-Household-Id', H).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Mine');
    });
  });

  describe('DELETE /categories/:id', () => {
    it('archives the category instead of hard-deleting', async () => {
      const id = await createCategory(app, 'Groceries');

      await request(app.getHttpServer()).delete(`/categories/${id}`).set('X-Household-Id', H).expect(204);

      const res = await request(app.getHttpServer())
        .get('/categories?includeArchived=true').set('X-Household-Id', H);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].isArchived).toBe(true);
    });

    it('returns 404 for a category from another household', async () => {
      const id = await createCategory(app, 'Theirs', 'expense', 'other-household');

      await request(app.getHttpServer()).delete(`/categories/${id}`).set('X-Household-Id', H).expect(404);
    });
  });

  describe('DELETE /categories/:id?permanent=true', () => {
    it('hard-deletes when there are no dependents', async () => {
      const id = await createCategory(app, 'Unused');

      await request(app.getHttpServer())
        .delete(`/categories/${id}?permanent=true`).set('X-Household-Id', H).expect(204);

      const list = await request(app.getHttpServer())
        .get('/categories?includeArchived=true').set('X-Household-Id', H);
      expect(list.body.find((c: { id: string }) => c.id === id)).toBeUndefined();
    });

    it('hard-deletes an already-archived category with no dependents', async () => {
      const id = await createCategory(app, 'Archived');
      await request(app.getHttpServer()).delete(`/categories/${id}`).set('X-Household-Id', H);

      await request(app.getHttpServer())
        .delete(`/categories/${id}?permanent=true`).set('X-Household-Id', H).expect(204);

      const list = await request(app.getHttpServer())
        .get('/categories?includeArchived=true').set('X-Household-Id', H);
      expect(list.body.find((c: { id: string }) => c.id === id)).toBeUndefined();
    });

    it('returns 409 with impact body when transactions still reference the category', async () => {
      const categoryId = await createCategory(app, 'Groceries');
      const accountRes = await request(app.getHttpServer())
        .post('/accounts').set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'Bank', type: 'bank', currency: 'UAH', allowsNegativeBalance: true });
      await request(app.getHttpServer())
        .post('/transactions').set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: accountRes.body.id, categoryId, type: 'expense', amount: 100, currency: 'UAH', date: '2026-07-30' });

      const res = await request(app.getHttpServer())
        .delete(`/categories/${categoryId}?permanent=true`).set('X-Household-Id', H).expect(409);

      expect(res.body.impact).toEqual({
        transactions: 1,
        recurringPayments: 0,
        subcategories: 0,
      });
    });

    it('returns 409 when subcategories still exist', async () => {
      const parentId = await createCategory(app, 'Food');
      await request(app.getHttpServer())
        .post('/categories').set('X-Household-Id', H)
        .send({ name: 'Fruit', type: 'expense', parentId });

      const res = await request(app.getHttpServer())
        .delete(`/categories/${parentId}?permanent=true`).set('X-Household-Id', H).expect(409);

      expect(res.body.impact.subcategories).toBe(1);
    });

    it('archive path still works when dependents exist (no ?permanent flag)', async () => {
      const categoryId = await createCategory(app, 'Groceries');
      const accountRes = await request(app.getHttpServer())
        .post('/accounts').set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'Bank', type: 'bank', currency: 'UAH', allowsNegativeBalance: true });
      await request(app.getHttpServer())
        .post('/transactions').set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: accountRes.body.id, categoryId, type: 'expense', amount: 100, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .delete(`/categories/${categoryId}`).set('X-Household-Id', H).expect(204);

      const list = await request(app.getHttpServer())
        .get('/categories?includeArchived=true').set('X-Household-Id', H);
      expect(list.body.find((c: { id: string }) => c.id === categoryId)?.isArchived).toBe(true);
    });

    it('does not accept truthy variants like "1" — treated as archive', async () => {
      const categoryId = await createCategory(app, 'Groceries');
      const accountRes = await request(app.getHttpServer())
        .post('/accounts').set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'Bank', type: 'bank', currency: 'UAH', allowsNegativeBalance: true });
      await request(app.getHttpServer())
        .post('/transactions').set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: accountRes.body.id, categoryId, type: 'expense', amount: 100, currency: 'UAH', date: '2026-07-30' });

      // ?permanent=1 must be treated as absent → archive, no 409
      await request(app.getHttpServer())
        .delete(`/categories/${categoryId}?permanent=1`).set('X-Household-Id', H).expect(204);
    });

    it('returns 404 for a foreign household', async () => {
      const foreignId = await createCategory(app, 'Theirs', 'expense', 'other-household');

      await request(app.getHttpServer())
        .delete(`/categories/${foreignId}?permanent=true`).set('X-Household-Id', H).expect(404);
    });
  });

  describe('POST /categories/:id/unarchive', () => {
    it('restores an archived category', async () => {
      const id = await createCategory(app, 'Groceries');
      await request(app.getHttpServer()).delete(`/categories/${id}`).set('X-Household-Id', H);

      const res = await request(app.getHttpServer())
        .post(`/categories/${id}/unarchive`).set('X-Household-Id', H).expect(201);

      expect(res.body.isArchived).toBe(false);

      const list = await request(app.getHttpServer()).get('/categories').set('X-Household-Id', H);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].id).toBe(id);
    });

    it('returns 404 for a category from another household', async () => {
      const id = await createCategory(app, 'Theirs', 'expense', 'other-household');

      await request(app.getHttpServer()).post(`/categories/${id}/unarchive`).set('X-Household-Id', H).expect(404);
    });
  });
});
