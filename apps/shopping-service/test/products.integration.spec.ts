import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { lookup } from 'dns/promises';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

const H = 'test-household-id';

describe('Products (integration)', () => {
  let app: INestApplication;
  let storeId: string;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    jest.restoreAllMocks();
    mockLookup.mockReset();
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

  describe('Cross-household reference isolation (#67)', () => {
    it('rejects POST /products with preferredStoreId from another household', async () => {
      const foreignStore = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', 'other').send({ name: 'Foreign' });

      await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Milk', preferredStoreId: foreignStore.body.id })
        .expect(404);
    });

    it('rejects POST /products with a foreign store in alternativeStoreIds', async () => {
      const foreignStore = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', 'other').send({ name: 'Foreign' });

      await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Milk', alternativeStoreIds: [storeId, foreignStore.body.id] })
        .expect(404);
    });

    it('rejects PATCH /products/:id that swaps in a foreign preferredStoreId', async () => {
      const created = await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H).send({ name: 'Milk' });
      const foreignStore = await request(app.getHttpServer())
        .post('/stores').set('X-Household-Id', 'other').send({ name: 'Foreign' });

      await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`).set('X-Household-Id', H)
        .send({ preferredStoreId: foreignStore.body.id })
        .expect(404);
    });
  });

  describe('Header enforcement (#81)', () => {
    it('rejects POST /products without X-Household-Id (401)', async () => {
      await request(app.getHttpServer()).post('/products').send({ name: 'Milk' }).expect(401);
    });

    it('rejects GET /products without X-Household-Id (401)', async () => {
      await request(app.getHttpServer()).get('/products').expect(401);
    });
  });

  describe('Product link + preview (#197)', () => {
    it('fetches and caches og:title/og:image for a valid, safe URL', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      const html = `<html><head>
        <meta property="og:title" content="Nice Oat Milk" />
        <meta property="og:image" content="https://cdn.example.com/oat.jpg" />
      </head></html>`;
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));

      const res = await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Oat Milk', url: 'https://store.example/oat-milk' })
        .expect(201);

      expect(res.body.url).toBe('https://store.example/oat-milk');
      expect(res.body.previewTitle).toBe('Nice Oat Milk');
      expect(res.body.imageUrl).toBe('https://cdn.example.com/oat.jpg');
    });

    it('still creates the product when the URL is safe but unreachable — no crash, null preview', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Bread', url: 'https://store.example/bread' })
        .expect(201);

      expect(res.body.url).toBe('https://store.example/bread');
      expect(res.body.imageUrl).toBeNull();
      expect(res.body.previewTitle).toBeNull();
    });

    it('rejects an SSRF attempt with 400 and never calls fetch', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
      const fetchSpy = jest.spyOn(global, 'fetch');

      await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Evil', url: 'http://attacker-controlled.example/' })
        .expect(400);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects a direct localhost URL with 400 without a DNS lookup', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Evil', url: 'http://localhost:22/' })
        .expect(400);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it('re-fetches the preview only when the URL actually changes on update', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('<html><head></head></html>', { status: 200 }));

      const created = await request(app.getHttpServer())
        .post('/products').set('X-Household-Id', H)
        .send({ name: 'Milk', url: 'https://store.example/milk' })
        .expect(201);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`).set('X-Household-Id', H)
        .send({ lastPrice: 42 })
        .expect(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`).set('X-Household-Id', H)
        .send({ url: 'https://store.example/milk-2' })
        .expect(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
