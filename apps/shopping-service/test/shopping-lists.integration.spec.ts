import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

function auth(app: INestApplication) {
  return request(app.getHttpServer());
}

describe('Shopping Lists (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(AppModule); });
  beforeEach(async () => { await cleanDatabase(app); resetKafkaMocks(); });
  afterAll(async () => { await app.close(); });

  async function createList(name = 'Weekly Shop') {
    return auth(app).post('/shopping-lists')
      .set('X-User-Id', U).set('X-Household-Id', H)
      .send({ name }).then(r => r.body);
  }

  async function addItem(listId: string, name: string) {
    return auth(app).post(`/shopping-lists/${listId}/items`)
      .set('X-User-Id', U).set('X-Household-Id', H)
      .send({ name, quantity: 2 }).then(r => r.body);
  }

  describe('POST /shopping-lists', () => {
    it('creates list with ACTIVE status', async () => {
      const res = await auth(app).post('/shopping-lists')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name: 'Weekly Shop' }).expect(201);

      expect(res.body.status).toBe('active');
      expect(res.body.createdBy).toBe(U);
    });
  });

  describe('GET /shopping-lists', () => {
    it('filters by status', async () => {
      const list = await createList('Active');
      await auth(app).post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U).set('X-Household-Id', H);
      await createList('Another Active');

      const res = await auth(app).get('/shopping-lists?status=active').set('X-Household-Id', H).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Another Active');
    });
  });

  describe('Items — add, update, delete', () => {
    it('adds items to list', async () => {
      const list = await createList();
      await addItem(list.id, 'Milk');
      await addItem(list.id, 'Bread');

      const res = await auth(app).get(`/shopping-lists/${list.id}`).set('X-Household-Id', H).expect(200);
      expect(res.body.items).toHaveLength(2);
    });

    it('marks item as purchased and emits Kafka event', async () => {
      const list = await createList();
      const item = await addItem(list.id, 'Eggs');

      await auth(app)
        .patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
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

      await auth(app).patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ isPurchased: true });
      mockKafkaProducer.emit.mockClear();

      await auth(app).patch(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ isPurchased: true });

      expect(mockKafkaProducer.emit).not.toHaveBeenCalled();
    });

    it('deletes an item', async () => {
      const list = await createList();
      const item = await addItem(list.id, 'Sugar');

      await auth(app).delete(`/shopping-lists/${list.id}/items/${item.id}`)
        .set('X-Household-Id', H).expect(204);

      const res = await auth(app).get(`/shopping-lists/${list.id}`).set('X-Household-Id', H);
      expect(res.body.items).toHaveLength(0);
    });
  });

  describe('POST /shopping-lists/:id/complete', () => {
    it('completes an active list and emits Kafka event', async () => {
      const list = await createList();
      await addItem(list.id, 'Item 1');

      const res = await auth(app).post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U).set('X-Household-Id', H)
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
      await auth(app).post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U).set('X-Household-Id', H);

      await auth(app).post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(400);
    });

    it('returns 404 for list from another household', async () => {
      const list = await createList();

      await auth(app).post(`/shopping-lists/${list.id}/complete`)
        .set('X-User-Id', U).set('X-Household-Id', 'other')
        .expect(404);
    });
  });
});
