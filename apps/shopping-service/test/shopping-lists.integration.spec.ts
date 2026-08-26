import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
  mockKafkaProducer,
} from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

function auth(app: INestApplication) {
  return request(app.getHttpServer());
}

describe('Shopping Lists (integration)', () => {
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

  async function createList(name = 'Weekly Shop') {
    return auth(app)
      .post('/shopping-lists')
      .set('X-User-Id', U)
      .set('X-Household-Id', H)
      .send({ name })
      .then((r) => r.body);
  }

  async function addItem(listId: string, name: string) {
    return auth(app)
      .post(`/shopping-lists/${listId}/items`)
      .set('X-User-Id', U)
      .set('X-Household-Id', H)
      .send({ name, quantity: 2 })
      .then((r) => r.body);
  }

  describe('POST /shopping-lists', () => {
    it('creates list with ACTIVE status', async () => {
      const res = await auth(app)
        .post('/shopping-lists')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Weekly Shop' })
        .expect(201);

      expect(res.body.status).toBe('active');
      expect(res.body.createdBy).toBe(U);
    });
  });

  describe('GET /shopping-lists', () => {
    it('filters by status', async () => {
      const list = await createList('Active');
      await auth(app)
        .post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H);
      await createList('Another Active');

      const res = await auth(app)
        .get('/shopping-lists?status=active')
        .set('X-Household-Id', H)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Another Active');
    });
  });

  describe('Items — add, update, delete', () => {
    it('adds items to list', async () => {
      const list = await createList();
      await addItem(list.id, 'Milk');
      await addItem(list.id, 'Bread');

      const res = await auth(app)
        .get(`/shopping-lists/${list.id}`)
        .set('X-Household-Id', H)
        .expect(200);
      expect(res.body.items).toHaveLength(2);
    });

    it('marks item as purchased and emits Kafka event', async () => {
      const list = await createList();
      const item = await addItem(list.id, 'Eggs');

      await auth(app)
        .patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ isPurchased: true, price: 35.0 })
        .expect(200);

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'shopping.item.purchased',
        expect.objectContaining({ listId: list.id, itemId: item.id }),
        expect.objectContaining({ householdId: H }),
      );
    });

    it('does NOT emit Kafka when marking already-purchased item again', async () => {
      const list = await createList();
      const item = await addItem(list.id, 'Eggs');

      await auth(app)
        .patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ isPurchased: true });
      mockKafkaProducer.emit.mockClear();

      await auth(app)
        .patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ isPurchased: true });

      expect(mockKafkaProducer.emit).not.toHaveBeenCalled();
    });

    it('rejects an item name shorter than 3 characters (400)', async () => {
      const list = await createList();
      await auth(app)
        .post(`/shopping-lists/${list.id}/items`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'ab' })
        .expect(400);
    });

    it('rejects a whitespace-only item name that trims below the floor (400)', async () => {
      const list = await createList();
      await auth(app)
        .post(`/shopping-lists/${list.id}/items`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: '  a  ' })
        .expect(400);
    });

    it('trims a valid item name before storing it', async () => {
      const list = await createList();
      const item = await addItem(list.id, '  Milk  ');
      expect(item.name).toBe('Milk');
    });

    it('deletes an item', async () => {
      const list = await createList();
      const item = await addItem(list.id, 'Sugar');

      await auth(app)
        .delete(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-Household-Id', H)
        .expect(204);

      const res = await auth(app)
        .get(`/shopping-lists/${list.id}`)
        .set('X-Household-Id', H);
      expect(res.body.items).toHaveLength(0);
    });
  });

  describe('POST /shopping-lists/:id/items/bulk (#195)', () => {
    it('creates all items in one request', async () => {
      const list = await createList();

      const res = await auth(app)
        .post(`/shopping-lists/${list.id}/items/bulk`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({
          items: [{ name: 'Milk' }, { name: 'Bread' }, { name: 'Eggs' }],
        })
        .expect(201);

      expect(res.body).toHaveLength(3);
      expect(res.body.map((i: { name: string }) => i.name)).toEqual([
        'Milk',
        'Bread',
        'Eggs',
      ]);

      const listRes = await auth(app)
        .get(`/shopping-lists/${list.id}`)
        .set('X-Household-Id', H);
      expect(listRes.body.items).toHaveLength(3);
    });

    it('rejects the whole batch (no partial rows) when one item name is too short', async () => {
      const list = await createList();

      await auth(app)
        .post(`/shopping-lists/${list.id}/items/bulk`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ items: [{ name: 'Milk' }, { name: 'ab' }] })
        .expect(400);

      const listRes = await auth(app)
        .get(`/shopping-lists/${list.id}`)
        .set('X-Household-Id', H);
      expect(listRes.body.items).toHaveLength(0);
    });

    it('rejects the whole batch when one item references a foreign store', async () => {
      const list = await createList();
      const foreignStore = await auth(app)
        .post('/stores')
        .set('X-Household-Id', 'other')
        .send({ name: 'Foreign' });

      await auth(app)
        .post(`/shopping-lists/${list.id}/items/bulk`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({
          items: [
            { name: 'Milk' },
            { name: 'Bread', preferredStoreId: foreignStore.body.id },
          ],
        })
        .expect(404);

      const listRes = await auth(app)
        .get(`/shopping-lists/${list.id}`)
        .set('X-Household-Id', H);
      expect(listRes.body.items).toHaveLength(0);
    });

    it('rejects an empty items array (400)', async () => {
      const list = await createList();

      await auth(app)
        .post(`/shopping-lists/${list.id}/items/bulk`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ items: [] })
        .expect(400);
    });

    it('rejects without X-Household-Id (401)', async () => {
      const list = await createList();
      await auth(app)
        .post(`/shopping-lists/${list.id}/items/bulk`)
        .set('X-User-Id', U)
        .send({ items: [{ name: 'Milk' }] })
        .expect(401);
    });
  });

  describe('POST /shopping-lists/:id/complete', () => {
    it('completes an active list and emits Kafka event', async () => {
      const list = await createList();
      await addItem(list.id, 'Item 1');

      const res = await auth(app)
        .post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .expect(201);

      expect(res.body.status).toBe('completed');
      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'shopping.list.completed',
        expect.objectContaining({ listId: list.id, householdId: H }),
        expect.any(Object),
      );
    });

    it('rejects completing an already-completed list', async () => {
      const list = await createList();
      await auth(app)
        .post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H);

      await auth(app)
        .post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .expect(400);
    });

    it('returns 404 for list from another household', async () => {
      const list = await createList();

      await auth(app)
        .post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U)
        .set('X-Household-Id', 'other')
        .expect(404);
    });
  });

  describe('Cross-household reference isolation (#67)', () => {
    it('rejects POST /shopping-lists with a storeId from another household', async () => {
      const foreignStore = await auth(app)
        .post('/stores')
        .set('X-Household-Id', 'other')
        .send({ name: 'Foreign' });

      await auth(app)
        .post('/shopping-lists')
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'List', storeId: foreignStore.body.id })
        .expect(404);
    });

    it('rejects PATCH /shopping-lists/:id that swaps in a foreign storeId', async () => {
      const list = await createList();
      const foreignStore = await auth(app)
        .post('/stores')
        .set('X-Household-Id', 'other')
        .send({ name: 'Foreign' });

      await auth(app)
        .patch(`/shopping-lists/${list.id}`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ storeId: foreignStore.body.id })
        .expect(404);
    });

    it('rejects POST /shopping-lists/:id/items with foreign productId', async () => {
      const list = await createList();
      const foreignProduct = await auth(app)
        .post('/products')
        .set('X-Household-Id', 'other')
        .send({ name: 'Foreign' });

      await auth(app)
        .post(`/shopping-lists/${list.id}/items`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Milk', productId: foreignProduct.body.id })
        .expect(404);
    });

    it('rejects POST /shopping-lists/:id/items with foreign preferredStoreId', async () => {
      const list = await createList();
      const foreignStore = await auth(app)
        .post('/stores')
        .set('X-Household-Id', 'other')
        .send({ name: 'Foreign' });

      await auth(app)
        .post(`/shopping-lists/${list.id}/items`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ name: 'Milk', preferredStoreId: foreignStore.body.id })
        .expect(404);
    });

    it('rejects PATCH /shopping-lists/:id/items/:itemId with foreign actualStoreId', async () => {
      const list = await createList();
      const item = await addItem(list.id, 'Milk');
      const foreignStore = await auth(app)
        .post('/stores')
        .set('X-Household-Id', 'other')
        .send({ name: 'Foreign' });

      await auth(app)
        .patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U)
        .set('X-Household-Id', H)
        .send({ actualStoreId: foreignStore.body.id })
        .expect(404);
    });
  });

  describe('Header enforcement (#81)', () => {
    it('rejects POST /shopping-lists without X-Household-Id (401)', async () => {
      await auth(app)
        .post('/shopping-lists')
        .set('X-User-Id', U)
        .send({ name: 'X' })
        .expect(401);
    });

    it('rejects GET /shopping-lists without X-Household-Id (401)', async () => {
      await auth(app).get('/shopping-lists').expect(401);
    });

    it('rejects POST /shopping-lists/:id/items without X-Household-Id (401)', async () => {
      const list = await createList();
      await auth(app)
        .post(`/shopping-lists/${list.id}/items`)
        .set('X-User-Id', U)
        .send({ name: 'Milk' })
        .expect(401);
    });
  });
});
