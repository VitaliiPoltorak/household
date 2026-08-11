import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks, mockKafkaProducer } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

async function createAccount(
  app: INestApplication,
  name: string,
  type = 'bank',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/accounts')
    .set('X-User-Id', U).set('X-Household-Id', H)
    .send({ name, type, currency: 'UAH' });
  return res.body.id as string;
}

async function getBalance(app: INestApplication, accountId: string): Promise<number> {
  const res = await request(app.getHttpServer())
    .get(`/accounts/${accountId}`)
    .set('X-User-Id', U).set('X-Household-Id', H);
  return Number(res.body.balance);
}

async function createCategory(
  app: INestApplication,
  householdId: string,
  name = 'Groceries',
  type = 'expense',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/categories')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ name, type });
  return res.body.id as string;
}

async function createIncomeSource(
  app: INestApplication,
  householdId: string,
  name = 'Main Job',
  type = 'salary',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/income-sources')
    .set('X-User-Id', U).set('X-Household-Id', householdId)
    .send({ name, type });
  return res.body.id as string;
}

describe('Transactions (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => { await app.close(); });

  describe('POST /transactions — income', () => {
    it('increases account balance', async () => {
      const accountId = await createAccount(app, 'Bank');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 5000, currency: 'UAH', date: '2026-07-30' })
        .expect(201);

      expect(await getBalance(app, accountId)).toBe(5000);
    });

    it('emits finance.transaction.created', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'finance.transaction.created',
        expect.objectContaining({ householdId: H }),
        expect.any(Object),
      );
    });
  });

  describe('POST /transactions — expense', () => {
    it('decreases account balance', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 300, currency: 'UAH', date: '2026-07-30' })
        .expect(201);

      expect(await getBalance(app, accountId)).toBe(700);
    });
  });

  describe('POST /transactions/transfer', () => {
    it('moves amount between accounts, net balance unchanged', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });

      const res = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' })
        .expect(201);

      const [debit, credit] = res.body as Array<{ transferPairId: string }>;
      expect(debit.transferPairId).toBe(credit.transferPairId);
      expect(await getBalance(app, fromId)).toBe(1500);
      expect(await getBalance(app, toId)).toBe(500);

      const summary = await request(app.getHttpServer())
        .get('/accounts/summary')
        .set('X-User-Id', U).set('X-Household-Id', H);
      expect(summary.body.totalBalance).toBe(2000);
    });

    it('rejects transfer to the same account', async () => {
      const id = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: id, toAccountId: id, amount: 100, currency: 'UAH', date: '2026-07-30' })
        .expect(400);
    });

    it('rejects transfer when destination account belongs to another household', async () => {
      const mine = await createAccount(app, 'Mine');
      const foreign = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .send({ name: 'Foreign', type: 'bank', currency: 'UAH' });

      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: mine, toAccountId: foreign.body.id, amount: 100, currency: 'UAH', date: '2026-07-30' })
        .expect(404);

      expect(await getBalance(app, mine)).toBe(0);
    });

    it('rejects transfer when source account belongs to another household', async () => {
      const mine = await createAccount(app, 'Mine');
      const foreign = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .send({ name: 'Foreign', type: 'bank', currency: 'UAH' });

      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: foreign.body.id, toAccountId: mine, amount: 100, currency: 'UAH', date: '2026-07-30' })
        .expect(404);

      expect(await getBalance(app, mine)).toBe(0);
    });

    it('rejects transfer when account does not exist', async () => {
      const mine = await createAccount(app, 'Mine');
      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: mine, toAccountId: '00000000-0000-0000-0000-000000000000', amount: 100, currency: 'UAH', date: '2026-07-30' })
        .expect(404);
    });
  });

  describe('Cross-household reference isolation', () => {
    it('rejects POST /transactions with a category from another household', async () => {
      const accountId = await createAccount(app, 'Bank');
      const foreignCategoryId = await createCategory(app, 'other-household', 'Foreign');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({
          accountId,
          categoryId: foreignCategoryId,
          type: 'expense',
          amount: 100,
          currency: 'UAH',
          date: '2026-07-30',
        })
        .expect(404);

      expect(await getBalance(app, accountId)).toBe(0);
    });

    it('rejects POST /transactions with an income source from another household', async () => {
      const accountId = await createAccount(app, 'Bank');
      const foreignIncomeSourceId = await createIncomeSource(app, 'other-household', 'Foreign');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({
          accountId,
          incomeSourceId: foreignIncomeSourceId,
          type: 'income',
          amount: 500,
          currency: 'UAH',
          date: '2026-07-30',
        })
        .expect(404);

      expect(await getBalance(app, accountId)).toBe(0);
    });

    it('rejects POST /transactions with an account from another household', async () => {
      const foreignAccountId = await request(app.getHttpServer())
        .post('/accounts')
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .send({ name: 'Foreign', type: 'bank', currency: 'UAH' });

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({
          accountId: foreignAccountId.body.id,
          type: 'income',
          amount: 100,
          currency: 'UAH',
          date: '2026-07-30',
        })
        .expect(404);
    });

    it('rejects PATCH /transactions/:id that swaps in a foreign category', async () => {
      const accountId = await createAccount(app, 'Bank');
      const tx = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 100, currency: 'UAH', date: '2026-07-30' });
      const foreignCategoryId = await createCategory(app, 'other-household', 'Foreign');

      await request(app.getHttpServer())
        .patch(`/transactions/${tx.body.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ categoryId: foreignCategoryId })
        .expect(404);
    });

    it('rejects PATCH /transactions/:id that swaps in a foreign income source', async () => {
      const accountId = await createAccount(app, 'Bank');
      const tx = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 100, currency: 'UAH', date: '2026-07-30' });
      const foreignIncomeSourceId = await createIncomeSource(app, 'other-household', 'Foreign');

      await request(app.getHttpServer())
        .patch(`/transactions/${tx.body.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ incomeSourceId: foreignIncomeSourceId })
        .expect(404);
    });
  });

  describe('GET /transactions — transfer pair collapsing (#167)', () => {
    it('surfaces a transfer as a SINGLE row with counterAccountId + counterTransactionId', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });
      const transferRes = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });
      const [debit, credit] = transferRes.body as Array<{ id: string; transferPairId: string }>;

      const list = await request(app.getHttpServer())
        .get('/transactions?type=transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      // Exactly one row for the pair (not two)
      expect(list.body).toHaveLength(1);
      const row = list.body[0];
      // Primary = debit leg (source account) by default
      expect(row.id).toBe(debit.id);
      expect(row.accountId).toBe(fromId);
      expect(row.transferDirection).toBe('debit');
      expect(row.transferPairId).toBe(debit.transferPairId);
      // Counterparty metadata attached
      expect(row.counterAccountId).toBe(toId);
      expect(row.counterTransactionId).toBe(credit.id);
      expect(row.counterAmount).toBe(500);
      expect(row.counterCurrency).toBe('UAH');
    });

    it('list without any filter also collapses each transfer to one row', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });

      const list = await request(app.getHttpServer())
        .get('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      // income + 1 transfer row (not 3)
      expect(list.body).toHaveLength(2);
      const transfers = list.body.filter((t: { type: string }) => t.type === 'transfer');
      expect(transfers).toHaveLength(1);
    });

    it('filter by SOURCE account surfaces the transfer with the source as primary', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });

      const list = await request(app.getHttpServer())
        .get(`/transactions?accountId=${fromId}&type=transfer`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(list.body).toHaveLength(1);
      expect(list.body[0].accountId).toBe(fromId);
      expect(list.body[0].counterAccountId).toBe(toId);
    });

    it('filter by DESTINATION account also surfaces the transfer, with destination as primary', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });

      const list = await request(app.getHttpServer())
        .get(`/transactions?accountId=${toId}&type=transfer`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(list.body).toHaveLength(1);
      // Primary flipped — the filtered account is on the "own" side
      expect(list.body[0].accountId).toBe(toId);
      expect(list.body[0].counterAccountId).toBe(fromId);
    });

    it('cross-household isolation: household B does not see household A transfers', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });

      const foreign = await request(app.getHttpServer())
        .get('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .expect(200);
      expect(foreign.body).toHaveLength(0);
    });

    it('non-transfer rows keep counter* fields null', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });

      const list = await request(app.getHttpServer())
        .get('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].counterAccountId).toBeNull();
      expect(list.body[0].counterTransactionId).toBeNull();
      expect(list.body[0].counterAmount).toBeNull();
      expect(list.body[0].counterCurrency).toBeNull();
    });
  });

  describe('DELETE /transactions/:id — transfer', () => {
    it('reverses both accounts and deletes both legs when deleting a transfer', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });

      const transferRes = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });
      const [debit, credit] = transferRes.body as Array<{ id: string }>;

      expect(await getBalance(app, fromId)).toBe(1500);
      expect(await getBalance(app, toId)).toBe(500);

      // Delete one leg — expect both legs gone and both balances restored
      await request(app.getHttpServer())
        .delete(`/transactions/${debit.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(204);

      expect(await getBalance(app, fromId)).toBe(2000);
      expect(await getBalance(app, toId)).toBe(0);

      // Paired leg should be gone too
      await request(app.getHttpServer())
        .delete(`/transactions/${credit.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(404);

      // No transfer transactions left
      const list = await request(app.getHttpServer())
        .get('/transactions?type=transfer')
        .set('X-User-Id', U).set('X-Household-Id', H);
      expect(list.body).toHaveLength(0);
    });

    it('rejects cross-household delete of the other household\'s transfer', async () => {
      // Household A creates a transfer
      const fromA = await createAccount(app, 'Bank A');
      const toA = await createAccount(app, 'Cash A', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromA, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });
      const transferRes = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromA, toAccountId: toA, amount: 500, currency: 'UAH', date: '2026-07-30' });
      const [debit] = transferRes.body as Array<{ id: string }>;

      // Household B tries to delete
      await request(app.getHttpServer())
        .delete(`/transactions/${debit.id}`)
        .set('X-User-Id', U).set('X-Household-Id', 'other-household')
        .expect(404);

      // Both legs still exist, balances unchanged
      expect(await getBalance(app, fromA)).toBe(1500);
      expect(await getBalance(app, toA)).toBe(500);
    });

    it('deleting the credit leg also reverses both balances', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');

      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 2000, currency: 'UAH', date: '2026-07-30' });

      const transferRes = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 500, currency: 'UAH', date: '2026-07-30' });
      const [, credit] = transferRes.body as Array<{ id: string }>;

      await request(app.getHttpServer())
        .delete(`/transactions/${credit.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(204);

      expect(await getBalance(app, fromId)).toBe(2000);
      expect(await getBalance(app, toId)).toBe(0);
    });
  });

  describe('DELETE /transactions/:id', () => {
    it('reverses balance on delete of income', async () => {
      const accountId = await createAccount(app, 'Bank');
      const tx = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 3000, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .delete(`/transactions/${tx.body.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(204);

      expect(await getBalance(app, accountId)).toBe(0);
    });

    it('reverses balance on delete of expense', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });
      const expense = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 400, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .delete(`/transactions/${expense.body.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(204);

      expect(await getBalance(app, accountId)).toBe(1000);
    });
  });

  describe('GET /transactions filters', () => {
    it('filters by type', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 500, currency: 'UAH', date: '2026-07-30' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'expense', amount: 200, currency: 'UAH', date: '2026-07-30' });

      const res = await request(app.getHttpServer())
        .get('/transactions?type=income')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body.every((t: { type: string }) => t.type === 'income')).toBe(true);
    });

    it('filters by date range', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 100, currency: 'UAH', date: '2026-06-15' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 200, currency: 'UAH', date: '2026-07-15' });

      const res = await request(app.getHttpServer())
        .get('/transactions?from=2026-07-01&to=2026-07-31')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe('2026-07-15');
    });

    it('includes transactions on the exact boundary date (#82 regression)', async () => {
      // Before #82 the filter was `date <= :to`. That works while the column
      // is DATE but silently drops rows dated exactly `to` if it becomes
      // TIMESTAMP. Half-open interval keeps this test green either way.
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 100, currency: 'UAH', date: '2026-07-31' });
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 200, currency: 'UAH', date: '2026-08-01' });

      const res = await request(app.getHttpServer())
        .get('/transactions?from=2026-07-01&to=2026-07-31')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe('2026-07-31');
    });
  });

  describe('Validation', () => {
    it('rejects negative amount', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: -100, currency: 'UAH', date: '2026-07-30' })
        .expect(400);
    });

    it('rejects transaction type "transfer" via POST /transactions', async () => {
      const accountId = await createAccount(app, 'Bank');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'transfer', amount: 100, currency: 'UAH', date: '2026-07-30' })
        .expect(400);
    });

    it('rejects PATCH that sets type to "transfer"', async () => {
      const accountId = await createAccount(app, 'Bank');
      const tx = await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId, type: 'income', amount: 100, currency: 'UAH', date: '2026-07-30' });

      await request(app.getHttpServer())
        .patch(`/transactions/${tx.body.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ type: 'transfer' })
        .expect(400);
    });

    it('rejects PATCH that changes the type of an existing transfer leg', async () => {
      const fromId = await createAccount(app, 'Bank');
      const toId = await createAccount(app, 'Cash', 'cash');
      await request(app.getHttpServer())
        .post('/transactions')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ accountId: fromId, type: 'income', amount: 1000, currency: 'UAH', date: '2026-07-30' });

      const transferRes = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ fromAccountId: fromId, toAccountId: toId, amount: 200, currency: 'UAH', date: '2026-07-30' });
      const [debit] = transferRes.body as Array<{ id: string }>;

      // Attempting to convert a transfer leg to a regular income row would
      // orphan the paired leg and desync balances.
      await request(app.getHttpServer())
        .patch(`/transactions/${debit.id}`)
        .set('X-User-Id', U).set('X-Household-Id', H)
        .send({ type: 'income' })
        .expect(400);
    });
  });
});
