import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
} from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';

describe('Stores (integration)', () => {
  let app: INestApplication;

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

  describe('POST /stores', () => {
    it('creates a store', async () => {
      const res = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Silpo', type: 'supermarket', address: 'Kyiv' })
        .expect(201);

      expect(res.body.name).toBe('Silpo');
      expect(res.body.type).toBe('supermarket');
      expect(res.body.householdId).toBe(H);
    });

    it('defaults type to other', async () => {
      const res = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Mini Shop' })
        .expect(201);

      expect(res.body.type).toBe('other');
    });

    it('rejects without X-Household-Id', async () => {
      await request(app.getHttpServer())
        .post('/stores')
        .send({ name: 'Test' })
        .expect(401);
    });
  });

  describe('GET /stores', () => {
    it('returns only stores for the household', async () => {
      await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'A' });
      await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', 'other')
        .send({ name: 'B' });

      const res = await request(app.getHttpServer())
        .get('/stores')
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('A');
    });
  });

  describe('PATCH /stores/:id', () => {
    it('updates store name', async () => {
      const created = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Old Name' });

      const res = await request(app.getHttpServer())
        .patch(`/stores/${created.body.id}`)
        .set('X-Household-Id', H)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
    });

    it('returns 404 for wrong household', async () => {
      const created = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'X' });

      await request(app.getHttpServer())
        .patch(`/stores/${created.body.id}`)
        .set('X-Household-Id', 'other')
        .send({ name: 'Y' })
        .expect(404);
    });
  });

  describe('DELETE /stores/:id', () => {
    it('deletes a store', async () => {
      const created = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'To Delete' });

      await request(app.getHttpServer())
        .delete(`/stores/${created.body.id}`)
        .set('X-Household-Id', H)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get('/stores')
        .set('X-Household-Id', H);
      expect(list.body).toHaveLength(0);
    });

    it('blocks deleting a store referenced by a product, with impact counts', async () => {
      const store = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Silpo' });
      await request(app.getHttpServer())
        .post('/products')
        .set('X-Household-Id', H)
        .set('X-User-Id', 'u1')
        .send({ name: 'Milk', preferredStoreId: store.body.id });

      const res = await request(app.getHttpServer())
        .delete(`/stores/${store.body.id}`)
        .set('X-Household-Id', H)
        .expect(409);

      expect(res.body.impact).toMatchObject({
        products: 1,
        lists: 0,
        items: 0,
      });

      const stillThere = await request(app.getHttpServer())
        .get('/stores')
        .set('X-Household-Id', H);
      expect(stillThere.body).toHaveLength(1);
    });

    it('blocks deleting a store referenced by a shopping list item', async () => {
      const store = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Silpo' });
      const list = await request(app.getHttpServer())
        .post('/shopping-lists')
        .set('X-Household-Id', H)
        .set('X-User-Id', 'u1')
        .send({ name: 'Weekly' });
      await request(app.getHttpServer())
        .post(`/shopping-lists/${list.body.id}/items`)
        .set('X-Household-Id', H)
        .set('X-User-Id', 'u1')
        .send({ name: 'Bread', preferredStoreId: store.body.id });

      const res = await request(app.getHttpServer())
        .delete(`/stores/${store.body.id}`)
        .set('X-Household-Id', H)
        .expect(409);

      expect(res.body.impact).toMatchObject({
        products: 0,
        lists: 0,
        items: 1,
      });
    });
  });

  describe('GET /stores/:id/impact', () => {
    it('returns zero counts for an unreferenced store', async () => {
      const store = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Unused' });

      const res = await request(app.getHttpServer())
        .get(`/stores/${store.body.id}/impact`)
        .set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toMatchObject({
        storeId: store.body.id,
        products: 0,
        lists: 0,
        items: 0,
      });
    });

    it('returns 404 for a store in another household', async () => {
      const store = await request(app.getHttpServer())
        .post('/stores')
        .set('X-Household-Id', H)
        .send({ name: 'Mine' });

      await request(app.getHttpServer())
        .get(`/stores/${store.body.id}/impact`)
        .set('X-Household-Id', 'other')
        .expect(404);
    });
  });
});
