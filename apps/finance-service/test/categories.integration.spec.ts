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
