import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';

const H = 'test-household-id';
const U = 'test-user-id';

/**
 * Withdrawal guard (#326).
 *
 * The bug: Account.canWithdraw() existed but no call site invoked it, so a
 * cash account holding $22.65 could be sent to -$999,976.35 by one mistyped
 * transfer. These cases pin both halves of the fix — that guarded paths refuse
 * the withdrawal, AND that the deliberately exempt paths (reversals,
 * corrections, accounts that opted in) still work. The second half matters as
 * much as the first: a blanket "never below zero" would trap records in the
 * ledger and make a genuinely overdrawn account impossible to reconcile.
 */
describe('Overdraft guard (integration)', () => {
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

  const req = () => request(app.getHttpServer());
  const auth = <T extends request.Test>(r: T): T =>
    r.set('X-User-Id', U).set('X-Household-Id', H) as T;

  async function createAccount(
    name: string,
    opts: { allowsNegativeBalance?: boolean; currency?: string } = {},
  ): Promise<string> {
    const res = await auth(req().post('/accounts')).send({
      name,
      type: 'cash',
      currency: opts.currency ?? 'UAH',
      ...(opts.allowsNegativeBalance !== undefined
        ? { allowsNegativeBalance: opts.allowsNegativeBalance }
        : {}),
    });
    return res.body.id as string;
  }

  async function balanceOf(accountId: string): Promise<number> {
    const res = await auth(req().get(`/accounts/${accountId}`));
    return Number(res.body.balance);
  }

  /** Funds an account through the income path so the balance is real, not seeded. */
  async function fund(accountId: string, amount: number): Promise<void> {
    await auth(req().post('/transactions'))
      .send({
        accountId,
        type: 'income',
        amount,
        currency: 'UAH',
        date: '2026-09-01',
      })
      .expect(201);
  }

  function expense(accountId: string, amount: number) {
    return auth(req().post('/transactions')).send({
      accountId,
      type: 'expense',
      amount,
      currency: 'UAH',
      date: '2026-09-02',
    });
  }

  describe('expense creation', () => {
    it('refuses an expense larger than the balance and leaves the balance untouched', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 22.65);

      const res = await expense(acc, 999_999).expect(409);

      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
      expect(res.body.available).toBe(22.65);
      expect(res.body.requested).toBe(999_999);
      expect(res.body.currency).toBe('UAH');
      expect(res.body.accountId).toBe(acc);
      expect(await balanceOf(acc)).toBe(22.65);
    });

    it('writes no transaction row when the withdrawal is refused', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 100);
      await expense(acc, 500).expect(409);

      // The income that funded it must be the only row — a refused expense
      // that still landed in the ledger would desync the balance from history.
      const list = await auth(req().get('/transactions').query({ accountId: acc }));
      expect(list.body).toHaveLength(1);
      expect(list.body[0].type).toBe('income');
    });

    it('spends against an opening balance without any funding transaction', async () => {
      // The first-run path: add an account that already holds money, then
      // spend from it. Before #326 gave accounts an opening balance this was
      // impossible without a corrective adjustment first.
      const res = await auth(req().post('/accounts')).send({
        name: 'Wallet',
        type: 'cash',
        currency: 'UAH',
        initialBalance: 200,
      });
      const acc = res.body.id as string;

      await expense(acc, 150).expect(201);
      expect(await balanceOf(acc)).toBe(50);
      await expense(acc, 51).expect(409);
    });

    it('allows an expense that exactly empties the account', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 100);
      await expense(acc, 100).expect(201);
      expect(await balanceOf(acc)).toBe(0);
    });

    it('allows any expense on an account that opted into a negative balance', async () => {
      const acc = await createAccount('Credit Card', { allowsNegativeBalance: true });
      await expense(acc, 1500).expect(201);
      expect(await balanceOf(acc)).toBe(-1500);
    });

    it('refuses a further withdrawal from an account already in the red', async () => {
      // Reachable via the exempt paths below, so the guard has to handle it.
      const acc = await createAccount('Cash Wallet');
      await auth(req().post(`/accounts/${acc}/adjust-balance`))
        .send({ newBalance: -50, description: 'Reconciled against statement' })
        .expect(201);

      await expense(acc, 1).expect(409);
      expect(await balanceOf(acc)).toBe(-50);
    });

    it('starts guarding once the allowance is switched off again', async () => {
      const acc = await createAccount('Was Credit', { allowsNegativeBalance: true });
      await expense(acc, 200).expect(201);

      await auth(req().patch(`/accounts/${acc}`))
        .send({ allowsNegativeBalance: false })
        .expect(200);

      await expense(acc, 1).expect(409);
      expect(await balanceOf(acc)).toBe(-200);
    });

    it('lets the same withdrawal through after the account opts in', async () => {
      const acc = await createAccount('Bank');
      await fund(acc, 10);
      await expense(acc, 500).expect(409);

      await auth(req().patch(`/accounts/${acc}`))
        .send({ allowsNegativeBalance: true })
        .expect(200);

      await expense(acc, 500).expect(201);
      expect(await balanceOf(acc)).toBe(-490);
    });
  });

  describe('transfer source leg', () => {
    it('refuses the transfer and moves neither account', async () => {
      const from = await createAccount('Cash Wallet');
      const to = await createAccount('Mono Card');
      await fund(from, 22.65);
      await fund(to, 1000);

      const res = await auth(req().post('/transactions/transfer'))
        .send({
          fromAccountId: from,
          toAccountId: to,
          amount: 999_999,
          currency: 'UAH',
          date: '2026-09-02',
        })
        .expect(409);

      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
      // The whole pair rolls back: the destination must not keep a credit
      // whose matching debit was refused.
      expect(await balanceOf(from)).toBe(22.65);
      expect(await balanceOf(to)).toBe(1000);
    });

    it('writes neither leg when the source cannot cover it', async () => {
      const from = await createAccount('Cash Wallet');
      const to = await createAccount('Mono Card');
      await fund(from, 10);

      await auth(req().post('/transactions/transfer'))
        .send({
          fromAccountId: from,
          toAccountId: to,
          amount: 5000,
          currency: 'UAH',
          date: '2026-09-02',
        })
        .expect(409);

      const list = await auth(req().get('/transactions').query({ type: 'transfer' }));
      expect(list.body).toHaveLength(0);
    });

    it('allows the transfer when the source opted into a negative balance', async () => {
      const from = await createAccount('Credit Card', { allowsNegativeBalance: true });
      const to = await createAccount('Mono Card');

      await auth(req().post('/transactions/transfer'))
        .send({
          fromAccountId: from,
          toAccountId: to,
          amount: 300,
          currency: 'UAH',
          date: '2026-09-02',
        })
        .expect(201);

      expect(await balanceOf(from)).toBe(-300);
      expect(await balanceOf(to)).toBe(300);
    });
  });

  describe('editing an existing transaction', () => {
    it('refuses raising an expense beyond what the account can cover', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 100);
      const tx = await expense(acc, 10).expect(201);
      expect(await balanceOf(acc)).toBe(90);

      await auth(req().patch(`/transactions/${tx.body.id}`))
        .send({ amount: 10_000 })
        .expect(409);

      // The original amount must survive a refused edit — both the balance
      // and the stored row.
      expect(await balanceOf(acc)).toBe(90);
      const after = await auth(req().get(`/transactions/${tx.body.id}`));
      expect(Number(after.body.amount)).toBe(10);
    });

    it('allows raising an expense the account can still cover', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 100);
      const tx = await expense(acc, 10).expect(201);

      await auth(req().patch(`/transactions/${tx.body.id}`))
        .send({ amount: 100 })
        .expect(200);

      // Checked against the balance with the OLD amount undone (100), not
      // against the post-expense 90 — otherwise a valid edit up to the full
      // balance would be wrongly refused.
      expect(await balanceOf(acc)).toBe(0);
    });

    it('allows lowering an expense', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 100);
      const tx = await expense(acc, 100).expect(201);

      await auth(req().patch(`/transactions/${tx.body.id}`))
        .send({ amount: 20 })
        .expect(200);

      expect(await balanceOf(acc)).toBe(80);
    });
  });

  describe('paths deliberately exempt from the guard', () => {
    it('deletes an income even when that leaves the account negative', async () => {
      const acc = await createAccount('Cash Wallet');
      const income = await auth(req().post('/transactions'))
        .send({ accountId: acc, type: 'income', amount: 100, currency: 'UAH', date: '2026-09-01' })
        .expect(201);
      await expense(acc, 100).expect(201);

      // Reversing the income takes the account to -100. Refusing this would
      // make a booked row impossible to delete.
      await auth(req().delete(`/transactions/${income.body.id}`)).expect(204);
      expect(await balanceOf(acc)).toBe(-100);
    });

    it('deletes a transfer whose reversal overdraws the destination', async () => {
      const from = await createAccount('Cash Wallet');
      const to = await createAccount('Mono Card');
      await fund(from, 500);

      const transfer = await auth(req().post('/transactions/transfer'))
        .send({
          fromAccountId: from,
          toAccountId: to,
          amount: 500,
          currency: 'UAH',
          date: '2026-09-02',
        })
        .expect(201);
      await expense(to, 500).expect(201);

      // Undoing the transfer debits `to`, which now holds nothing.
      const legId = (transfer.body as Array<{ id: string }>)[0].id;
      await auth(req().delete(`/transactions/${legId}`)).expect(204);

      expect(await balanceOf(from)).toBe(500);
      expect(await balanceOf(to)).toBe(-500);
    });

    it('accepts a manual balance adjustment into the red', async () => {
      const acc = await createAccount('Cash Wallet');
      await fund(acc, 100);

      // The user stating what the balance actually is, against a real
      // statement — the escape hatch the guard must not close.
      await auth(req().post(`/accounts/${acc}/adjust-balance`))
        .send({ newBalance: -250, description: 'Overdrawn per statement' })
        .expect(201);

      expect(await balanceOf(acc)).toBe(-250);
    });
  });

  describe('tenant isolation', () => {
    it('does not leak a foreign account through the guard', async () => {
      const mine = await createAccount('Cash Wallet');
      await fund(mine, 50);

      const res = await req()
        .post('/transactions')
        .set('X-User-Id', 'other-user')
        .set('X-Household-Id', 'other-household-id')
        .send({
          accountId: mine,
          type: 'expense',
          amount: 999_999,
          currency: 'UAH',
          date: '2026-09-02',
        });

      // 404 from the reference check, not 409 — a stranger must not be able to
      // probe another household's balance by reading the error body.
      expect(res.status).toBe(404);
      expect(res.body.available).toBeUndefined();
    });
  });
});
