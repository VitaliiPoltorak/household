import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';

describe('Stores (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => { await cleanDatabase(app); resetKafkaMocks(); });
  afterAll(async () => { await app.close(); });

  describe('POST /stores', () => {
    it('creates a store', async () => {
      const res = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', H)
        .send({ name: 'Silpo', type: 'supermarket', address: 'Kyiv' })
        .expect(201);

      expect(res.body.name).toBe('Silpo');
      expect(res.body.type).toBe('supermarket');
      expect(res.body.householdId).toBe(H);
    });

    it('defaults type to other', async () => {
      const res = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', H)
        .send({ name: 'Mini Shop' })
        .expect(201);

      expect(res.body.type).toBe('other');
    });

    it('rejects without X-Household-Id', async () => {
      await request(app.getHttpServer())
        .post('/stores').send({ name: 'Test' })
        .expect(401);
    });
  });

  describe('GET /stores', () => {
    it('returns only stores for the household', async () => {
      await request(app.getHttpServer()).post('/stores').set('X-Household-Id', H).send({ name: 'A' });
      await request(app.getHttpServer()).post('/stores').set('X-Household-Id', 'other').send({ name: 'B' });

      const res = await request(app.getHttpServer())
        .get('/stores').set('X-Household-Id', H).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('A');
    });
  });

  describe('PATCH /stores/:id', () => {
    it('updates store name', async () => {
      const created = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', H).send({ name: 'Old Name' });

      const res = await request(app.getHttpServer())
        .patch(`/stores/${created.body.id}`).set('X-Household-Id', H)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
    });

    it('returns 404 for wrong household', async () => {
      const created = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', H).send({ name: 'X' });

      await request(app.getHttpServer())
        .patch(`/stores/${created.body.id}`).set('X-Household-Id', 'other')
        .send({ name: 'Y' })
        .expect(404);
    });
  });

  describe('DELETE /stores/:id', () => {
    it('deletes a store', async () => {
      const created = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', H).send({ name: 'To Delete' });

      await request(app.getHttpServer())
        .delete(`/stores/${created.body.id}`).set('X-Household-Id', H)
        .expect(204);

      const list = await request(app.getHttpServer()).get('/stores').set('X-Household-Id', H);
      expect(list.body).toHaveLength(0);
    });
  });
});
