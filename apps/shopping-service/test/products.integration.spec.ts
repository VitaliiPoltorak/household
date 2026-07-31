import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';

describe('Products (integration)', () => {
  let app: INestApplication;
  let storeId: string;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    storeId = (
      await request(app.getHttpServer()).post('/stores').set('X-Household-Id', H).send({ name: 'Silpo' })
    ).body.id;
  });
  afterAll(async () => { await app.close(); });

  it('creates a product with all fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/products').set('X-Household-Id', H)
      .send({ name: 'Milk', category: 'Dairy', unit: 'L', preferredStoreId: storeId, lastPrice: 45.5 })
      .expect(201);

    expect(res.body.name).toBe('Milk');
    expect(Number(res.body.lastPrice)).toBeCloseTo(45.5);
    expect(res.body.preferredStoreId).toBe(storeId);
    expect(res.body.alternativeStoreIds).toEqual([]);
  });

  it('searches by name', async () => {
    await request(app.getHttpServer()).post('/products').set('X-Household-Id', H).send({ name: 'Whole Milk' });
    await request(app.getHttpServer()).post('/products').set('X-Household-Id', H).send({ name: 'Bread' });

    const res = await request(app.getHttpServer())
      .get('/products?search=milk').set('X-Household-Id', H).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Whole Milk');
  });

  it('filters by preferred store', async () => {
    const storeB = (await request(app.getHttpServer()).post('/stores').set('X-Household-Id', H).send({ name: 'ATB' })).body.id;
    await request(app.getHttpServer()).post('/products').set('X-Household-Id', H).send({ name: 'A', preferredStoreId: storeId });
    await request(app.getHttpServer()).post('/products').set('X-Household-Id', H).send({ name: 'B', preferredStoreId: storeB });

    const res = await request(app.getHttpServer())
      .get(`/products?storeId=${storeId}`).set('X-Household-Id', H).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('A');
  });

  it('isolates products by household', async () => {
    await request(app.getHttpServer()).post('/products').set('X-Household-Id', H).send({ name: 'Mine' });
    await request(app.getHttpServer()).post('/products').set('X-Household-Id', 'other').send({ name: 'Theirs' });

    const res = await request(app.getHttpServer()).get('/products').set('X-Household-Id', H).expect(200);
    expect(res.body).toHaveLength(1);
  });
});
