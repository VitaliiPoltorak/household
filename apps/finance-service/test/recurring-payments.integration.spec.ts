import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

describe('Recurring Payments (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => { await app.close(); });

  it('creates a recurring payment', async () => {
    const res = await request(app.getHttpServer())
      .post('/recurring-payments')
      .set('X-User-Id', U).set('X-Household-Id', H)
      .send({ name: 'Netflix', amount: 189, currency: 'UAH', frequency: 'monthly', nextDueDate: '2026-08-01' })
      .expect(201);

    expect(res.body.name).toBe('Netflix');
    expect(Number(res.body.amount)).toBe(189);
  });

  it('GET /recurring-payments/upcoming returns payments due within N days', async () => {
    const today = new Date();
    const in10Days = new Date(today);
    in10Days.setDate(today.getDate() + 10);
    const in60Days = new Date(today);
    in60Days.setDate(today.getDate() + 60);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    await request(app.getHttpServer())
      .post('/recurring-payments')
      .set('X-User-Id', U).set('X-Household-Id', H)
      .send({ name: 'Soon', amount: 100, frequency: 'monthly', nextDueDate: fmt(in10Days) });
    await request(app.getHttpServer())
      .post('/recurring-payments')
      .set('X-User-Id', U).set('X-Household-Id', H)
      .send({ name: 'Later', amount: 200, frequency: 'monthly', nextDueDate: fmt(in60Days) });

    const res = await request(app.getHttpServer())
      .get('/recurring-payments/upcoming?days=30')
      .set('X-Household-Id', H)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Soon');
  });
});
