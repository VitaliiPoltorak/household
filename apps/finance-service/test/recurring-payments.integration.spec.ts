import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import { AppModule } from '../src/app.module';
import { RecurringPaymentScheduler } from '../src/recurring-payments/recurring-payment.scheduler';

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

  describe('Scheduler — fireDueRecurringPayments (#78)', () => {
    async function createAccount(name = 'Bank'): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ name, type: 'bank', currency: 'UAH' });
      return res.body.id as string;
    }

    async function createDuePayment(dto: {
      name: string; amount: number; frequency: 'weekly' | 'monthly' | 'yearly';
      nextDueDate: string; accountId?: string;
    }): Promise<{ id: string }> {
      const res = await request(app.getHttpServer())
        .post('/recurring-payments')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send(dto);
      return res.body;
    }

    async function listPayments(): Promise<Array<{ id: string; nextDueDate: string }>> {
      const res = await request(app.getHttpServer())
        .get('/recurring-payments')
        .set('X-Household-Id', H);
      return res.body;
    }

    async function listTransactions(): Promise<Array<{ id: string; amount: string; description: string; date: string; type: string }>> {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H);
      return res.body;
    }

    it('fires a due payment: creates transaction, advances nextDueDate, emits event', async () => {
      const accountId = await createAccount();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const payment = await createDuePayment({
        name: 'Netflix', amount: 189, frequency: 'monthly',
        nextDueDate: yesterdayStr, accountId,
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.fireDueRecurringPayments();

      const txs = await listTransactions();
      expect(txs).toHaveLength(1);
      expect(txs[0].type).toBe('expense');
      expect(Number(txs[0].amount)).toBe(189);
      expect(txs[0].description).toBe('Netflix (recurring)');
      expect(txs[0].date).toBe(yesterdayStr); // dated on the DUE date, not today

      const payments = await listPayments();
      // nextDueDate advanced by 1 month
      expect(payments[0].nextDueDate).not.toBe(yesterdayStr);
      expect(new Date(payments[0].nextDueDate).getTime()).toBeGreaterThan(new Date(yesterdayStr).getTime());

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'finance.recurring.triggered',
        expect.objectContaining({
          recurringPaymentId: payment.id,
          householdId: H,
        }),
        expect.objectContaining({ householdId: H }),
      );
    });

    it('is idempotent — second run does not double-fire', async () => {
      const accountId = await createAccount();
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      await createDuePayment({
        name: 'Rent', amount: 15000, frequency: 'monthly',
        nextDueDate: yesterdayStr, accountId,
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.fireDueRecurringPayments();
      await scheduler.fireDueRecurringPayments();

      const txs = await listTransactions();
      expect(txs).toHaveLength(1);
    });

    it('skips payments whose nextDueDate is in the future', async () => {
      const accountId = await createAccount();
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      await createDuePayment({
        name: 'FutureBill', amount: 100, frequency: 'weekly',
        nextDueDate: tomorrow, accountId,
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.fireDueRecurringPayments();

      expect(await listTransactions()).toHaveLength(0);
    });

    it('advances weekly by 7 days', async () => {
      const accountId = await createAccount();
      const dueDate = '2026-01-05'; // known past date
      const p = await createDuePayment({
        name: 'Weekly', amount: 50, frequency: 'weekly',
        nextDueDate: dueDate, accountId,
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.firePayment(await scheduler['repo'].findOneOrFail({ where: { id: p.id } }));

      const payments = await listPayments();
      expect(payments[0].nextDueDate).toBe('2026-01-12');
    });

    it('advances yearly by 1 year', async () => {
      const accountId = await createAccount();
      const p = await createDuePayment({
        name: 'Insurance', amount: 5000, frequency: 'yearly',
        nextDueDate: '2026-01-05', accountId,
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.firePayment(await scheduler['repo'].findOneOrFail({ where: { id: p.id } }));

      const payments = await listPayments();
      expect(payments[0].nextDueDate).toBe('2027-01-05');
    });

    it('advances due date even for payments without accountId — does not create a transaction', async () => {
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      await createDuePayment({
        name: 'NoAccount', amount: 100, frequency: 'monthly',
        nextDueDate: yesterdayStr, // no accountId
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.fireDueRecurringPayments();

      expect(await listTransactions()).toHaveLength(0);
      const payments = await listPayments();
      expect(payments[0].nextDueDate).not.toBe(yesterdayStr);
    });

    it('one failing payment does not stop the batch', async () => {
      const accountId = await createAccount();
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // A payment referencing a nonexistent account will fail create()
      await createDuePayment({
        name: 'Broken', amount: 100, frequency: 'monthly',
        nextDueDate: yesterdayStr, accountId: '00000000-0000-0000-0000-000000000000',
      });
      await createDuePayment({
        name: 'Good', amount: 200, frequency: 'monthly',
        nextDueDate: yesterdayStr, accountId,
      });

      const scheduler = app.get(RecurringPaymentScheduler);
      await scheduler.fireDueRecurringPayments();

      const txs = await listTransactions();
      // Only the good one fired
      expect(txs).toHaveLength(1);
      expect(txs[0].description).toBe('Good (recurring)');
    });
  });
});
