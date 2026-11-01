import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
  mockKafkaProducer,
} from '@household/testing';
import { AppModule } from '../src/app.module';
import { NetWorthSnapshotScheduler } from '../src/net-worth-snapshots/net-worth-snapshot.scheduler';
import { NetWorthSnapshotPromptService } from '../src/net-worth-snapshots/net-worth-snapshot-prompt.service';
import {
  NetWorthSnapshot,
  NetWorthSnapshotSource,
} from '../src/net-worth-snapshots/entities/net-worth-snapshot.entity';

const H = 'test-household-id';
const H2 = 'other-household-id';
const U = 'test-user-id';

function post(app: INestApplication, path: string, body: object, hid = H) {
  return request(app.getHttpServer())
    .post(path)
    .set('X-User-Id', U)
    .set('X-Household-Id', hid)
    .send(body);
}

function get(app: INestApplication, path: string, hid = H) {
  return request(app.getHttpServer()).get(path).set('X-Household-Id', hid);
}

function del(app: INestApplication, path: string, hid = H) {
  return request(app.getHttpServer())
    .delete(path)
    .set('X-User-Id', U)
    .set('X-Household-Id', hid);
}

describe('Net-worth snapshots (integration, #379)', () => {
  let app: INestApplication;
  let accountId: string;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
  });
  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    const acct = await post(app, '/accounts', {
      name: 'Bank',
      type: 'bank',
      currency: 'UAH',
      allowsNegativeBalance: true,
    });
    accountId = acct.body.id;
    await post(app, '/transactions', {
      accountId,
      type: 'income',
      amount: 5000,
      currency: 'UAH',
      date: '2026-07-01',
    });
  });
  afterAll(async () => {
    await app.close();
  });

  describe('Snapshot prompt window (#406)', () => {
    const svc = () => app.get(NetWorthSnapshotPromptService);

    // [today, expected month, expected to show]
    it.each([
      // 30-day month: window opens 26 Nov.
      ['2026-11-25', '2026-10'],
      ['2026-11-26', '2026-11'],
      ['2026-11-30', '2026-11'],
      // Still names November after the month ended.
      ['2026-12-03', '2026-11'],
      ['2026-12-05', '2026-11'],
      // 31-day month: opens 27 Dec; the unanswered November prompt is replaced.
      ['2026-12-26', '2026-11'],
      ['2026-12-27', '2026-12'],
      // 28-day February (non-leap): opens 24 Feb.
      ['2027-02-23', '2027-01'],
      ['2027-02-24', '2027-02'],
      // 29-day February (leap year): opens 25 Feb.
      ['2028-02-24', '2028-01'],
      ['2028-02-25', '2028-02'],
      // 31-day January.
      ['2027-01-26', '2026-12'],
      ['2027-01-27', '2027-01'],
    ])('on %s the prompt asks about %s', async (today, month) => {
      const state = await svc().getState(H, today);
      expect(state).toMatchObject({ show: true, month });
    });

    it('does not carry an unanswered month over once the next window opens', async () => {
      await svc().snooze(H, U, '2026-12-05'); // November, snoozed
      const state = await svc().getState(H, '2026-12-27');
      expect(state).toMatchObject({ show: true, month: '2026-12' });
      // November never gets a snapshot.
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureAll('2027-01-10');
      const res = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('snooze hides the bar for the rest of the day and it returns the next day', async () => {
      const after = await svc().snooze(H, U, '2026-11-26');
      expect(after).toMatchObject({ show: false, snoozedUntil: '2026-11-27' });
      expect(await svc().getState(H, '2026-11-26')).toMatchObject({
        show: false,
      });
      expect(await svc().getState(H, '2026-11-27')).toMatchObject({
        show: true,
        month: '2026-11',
      });
    });

    it('keeps asking daily after month end until Yes is pressed', async () => {
      await svc().snooze(H, U, '2026-12-03');
      expect((await svc().getState(H, '2026-12-03')).show).toBe(false);
      const next = await svc().getState(H, '2026-12-04');
      expect(next).toMatchObject({ show: true, month: '2026-11' });
    });

    it('confirm hides the prompt for that month and it does not return', async () => {
      await svc().confirm(H, U, '2026-11-28');
      expect((await svc().getState(H, '2026-11-28')).show).toBe(false);
      expect((await svc().getState(H, '2026-12-10')).show).toBe(false);
      // The next month's prompt appears when its own window opens.
      expect(await svc().getState(H, '2026-12-27')).toMatchObject({
        show: true,
        month: '2026-12',
      });
    });

    it('confirm is idempotent and keeps the original confirmation day', async () => {
      await svc().confirm(H, U, '2026-11-28');
      await svc().confirm(H, U, '2026-11-29');
      const [pending] = await svc().listPendingCaptures('2026-12-01');
      expect(pending.confirmedOn).toBe('2026-11-28');
    });

    it('is per household', async () => {
      await svc().confirm(H, U, '2026-11-28');
      expect((await svc().getState(H2, '2026-11-28')).show).toBe(true);
    });

    it('publishes a realtime event on confirm and snooze', async () => {
      resetKafkaMocks();
      await svc().snooze(H, U, '2026-11-26');
      await svc().confirm(H, U, '2026-11-26');
      expect(
        mockKafkaProducer.emit.mock.calls.map((c) => c[0]),
      ).toEqual([
        'finance.snapshotPrompt.updated',
        'finance.snapshotPrompt.updated',
      ]);
    });
  });

  describe('Snapshot prompt endpoints (#406)', () => {
    it('GET returns the current state; snooze then confirm via HTTP', async () => {
      const first = await get(
        app,
        '/reports/net-worth/snapshot-prompt',
      ).expect(200);
      expect(first.body.show).toBe(true);
      expect(first.body.month).toMatch(/^\d{4}-\d{2}$/);

      const snoozed = await post(
        app,
        '/reports/net-worth/snapshot-prompt/snooze',
        {},
      ).expect(200);
      expect(snoozed.body.show).toBe(false);

      const confirmed = await post(
        app,
        '/reports/net-worth/snapshot-prompt/confirm',
        {},
      ).expect(200);
      expect(confirmed.body).toMatchObject({ show: false, month: null });
      const after = await get(app, '/reports/net-worth/snapshot-prompt').expect(
        200,
      );
      expect(after.body.show).toBe(false);
    });

    it('requires the household header', async () => {
      await request(app.getHttpServer())
        .get('/reports/net-worth/snapshot-prompt')
        .expect(401);
    });
  });

  describe('Scheduler — end-of-day capture after Yes (#406)', () => {
    const svc = () => app.get(NetWorthSnapshotPromptService);

    it('captures a snapshot dated the confirmation day, including a transaction entered after pressing Yes', async () => {
      await svc().confirm(H, U, '2026-11-28');
      // Entered after the click, still on the confirmation day.
      await post(app, '/transactions', {
        accountId,
        type: 'income',
        amount: 1000,
        currency: 'UAH',
        date: '2026-11-28',
      });

      // Nothing is captured while the confirmation day is still running.
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureAll('2026-11-28');
      expect(
        (await get(app, '/reports/net-worth/snapshots').expect(200)).body,
      ).toHaveLength(0);

      await scheduler.captureAll('2026-11-29');
      const res = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        householdId: H,
        snapshotDate: '2026-11-28',
        source: 'confirmed',
      });
      expect(res.body[0].byCurrency.UAH).toBeCloseTo(6000);
    });

    it('catches up after missed runs and does not capture twice', async () => {
      await svc().confirm(H, U, '2026-11-28');
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureAll('2026-12-04'); // several runs missed
      expect(
        (await get(app, '/reports/net-worth/snapshots').expect(200)).body,
      ).toHaveLength(1);

      // A user deleting the snapshot is not undone by a later run.
      const [snap] = (await get(app, '/reports/net-worth/snapshots')).body;
      await del(app, `/reports/net-worth/snapshots/${snap.id}`).expect(204);
      await scheduler.captureAll('2026-12-05');
      expect(
        (await get(app, '/reports/net-worth/snapshots').expect(200)).body,
      ).toHaveLength(0);
    });

    it('is idempotent per (household, date) and isolates households', async () => {
      await post(
        app,
        '/accounts',
        { name: 'Other Bank', type: 'bank', currency: 'UAH' },
        H2,
      );
      await svc().confirm(H, U, '2026-11-28');
      await svc().confirm(H2, U, '2026-11-28');
      await app.get(NetWorthSnapshotScheduler).captureAll('2026-11-29');

      const h1 = await get(app, '/reports/net-worth/snapshots', H).expect(200);
      const h2 = await get(app, '/reports/net-worth/snapshots', H2).expect(200);
      expect(h1.body).toHaveLength(1);
      expect(h1.body[0].byCurrency.UAH).toBeCloseTo(5000);
      expect(h2.body).toHaveLength(1);
      expect(h2.body[0].byCurrency.UAH).toBeCloseTo(0);
    });

    it('skips a household with no active accounts instead of storing an empty snapshot', async () => {
      await svc().confirm('household-with-no-accounts', U, '2026-11-28');
      await app.get(NetWorthSnapshotScheduler).captureAll('2026-11-29');
      const res = await get(
        app,
        '/reports/net-worth/snapshots',
        'household-with-no-accounts',
      ).expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('does not run the old 1st-of-month capture any more', () => {
      const scheduler = app.get(NetWorthSnapshotScheduler);
      expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', scheduler.captureAll))
        .toMatchObject({ cronTime: '5 0 * * *' });
    });
  });

  describe('POST /reports/net-worth/snapshots (manual entry)', () => {
    it('creates a manual snapshot for an arbitrary date', async () => {
      const res = await post(app, '/reports/net-worth/snapshots', {
        date: '2025-01-01',
        byCurrency: { UAH: 12000 },
      }).expect(201);

      expect(res.body).toMatchObject({
        householdId: H,
        snapshotDate: '2025-01-01',
        byCurrency: { UAH: 12000 },
        source: 'manual',
      });
    });

    // The core reconciliation rule (#379): a manual entry for a date that
    // already has an auto-captured row overwrites it rather than adding a
    // second row for the same (household, date).
    it('overwrites an existing auto-captured snapshot for the same date instead of duplicating it', async () => {
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureOne(H, '2026-08-01');

      await post(app, '/reports/net-worth/snapshots', {
        date: '2026-08-01',
        byCurrency: { UAH: 9999 },
      }).expect(201);

      const res = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        snapshotDate: '2026-08-01',
        byCurrency: { UAH: 9999 },
        source: 'manual',
      });
    });

    it('backfills a date far predating the household itself', async () => {
      const res = await post(app, '/reports/net-worth/snapshots', {
        date: '2018-01-01',
        byCurrency: { UAH: 3000, USD: 100 },
      }).expect(201);

      expect(res.body.snapshotDate).toBe('2018-01-01');
      expect(res.body.byCurrency).toEqual({ UAH: 3000, USD: 100 });
    });

    it('always stores manual — the DTO has no source field for the client to pick "auto" with', async () => {
      // The global ValidationPipe (forbidNonWhitelisted) rejects the extra
      // field outright, which is the stronger guarantee: there is no way
      // for a client of this endpoint to produce an "auto" row at all.
      await post(app, '/reports/net-worth/snapshots', {
        date: '2026-08-01',
        byCurrency: { UAH: 1 },
        source: 'auto',
      }).expect(400);

      const res = await post(app, '/reports/net-worth/snapshots', {
        date: '2026-08-01',
        byCurrency: { UAH: 1 },
      }).expect(201);
      expect(res.body.source).toBe('manual');
    });

    it('rejects an empty byCurrency', async () => {
      await post(app, '/reports/net-worth/snapshots', {
        date: '2026-08-01',
        byCurrency: {},
      }).expect(400);
    });

    it('rejects a non-numeric amount', async () => {
      await post(app, '/reports/net-worth/snapshots', {
        date: '2026-08-01',
        byCurrency: { UAH: 'a lot' },
      }).expect(400);
    });

    it('household isolation — a snapshot created for one household is invisible to another', async () => {
      await post(app, '/reports/net-worth/snapshots', {
        date: '2026-08-01',
        byCurrency: { UAH: 500 },
      });

      const other = await get(app, '/reports/net-worth/snapshots', H2).expect(
        200,
      );
      expect(other.body).toHaveLength(0);
    });
  });

  describe('POST /reports/net-worth/snapshots/bulk (backfill import)', () => {
    it('imports several months of history in one request', async () => {
      const res = await post(app, '/reports/net-worth/snapshots/bulk', {
        snapshots: [
          { date: '2025-01-01', byCurrency: { UAH: 1000 } },
          { date: '2025-02-01', byCurrency: { UAH: 1500 } },
          { date: '2025-03-01', byCurrency: { UAH: 1800 } },
        ],
      }).expect(201);

      expect(res.body).toEqual({ count: 3 });
      const list = await get(
        app,
        '/reports/net-worth/snapshots?from=2025-01-01&to=2025-03-31',
      ).expect(200);
      expect(list.body).toHaveLength(3);
      expect(
        list.body.map((s: { snapshotDate: string }) => s.snapshotDate),
      ).toEqual(['2025-01-01', '2025-02-01', '2025-03-01']);
    });

    it('rejects a batch with a repeated date', async () => {
      await post(app, '/reports/net-worth/snapshots/bulk', {
        snapshots: [
          { date: '2025-01-01', byCurrency: { UAH: 1000 } },
          { date: '2025-01-01', byCurrency: { UAH: 2000 } },
        ],
      }).expect(400);
    });

    it('rejects an empty batch', async () => {
      await post(app, '/reports/net-worth/snapshots/bulk', {
        snapshots: [],
      }).expect(400);
    });
  });

  describe('DELETE /reports/net-worth/snapshots/:id', () => {
    it('deletes a manual snapshot', async () => {
      const created = await post(app, '/reports/net-worth/snapshots', {
        date: '2025-05-01',
        byCurrency: { UAH: 1000 },
      }).expect(201);

      await del(app, `/reports/net-worth/snapshots/${created.body.id}`).expect(
        204,
      );

      const list = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(
        list.body.find((s: { id: string }) => s.id === created.body.id),
      ).toBeUndefined();
    });

    it('deletes a confirmed snapshot', async () => {
      await app.get(NetWorthSnapshotScheduler).captureOne(H, '2025-05-01');
      const list = await get(app, '/reports/net-worth/snapshots').expect(200);
      await del(app, `/reports/net-worth/snapshots/${list.body[0].id}`).expect(204);
    });

    it('rejects deleting a legacy auto snapshot', async () => {
      // A legacy row from the retired 1st-of-month cron (#379).
      await app.get(DataSource).getRepository(NetWorthSnapshot).insert({
        householdId: H,
        snapshotDate: '2025-05-01',
        byCurrency: { UAH: 1 },
        source: NetWorthSnapshotSource.AUTO,
      });
      const list = await get(app, '/reports/net-worth/snapshots').expect(200);
      const autoSnapshot = list.body[0];

      await del(app, `/reports/net-worth/snapshots/${autoSnapshot.id}`).expect(
        400,
      );

      const after = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(after.body).toHaveLength(1);
    });

    it('returns 404 for a snapshot that does not exist', async () => {
      await del(
        app,
        '/reports/net-worth/snapshots/00000000-0000-0000-0000-000000000000',
      ).expect(404);
    });

    it("does not let one household delete another household's snapshot", async () => {
      const created = await post(app, '/reports/net-worth/snapshots', {
        date: '2025-05-01',
        byCurrency: { UAH: 1000 },
      }).expect(201);

      await del(
        app,
        `/reports/net-worth/snapshots/${created.body.id}`,
        H2,
      ).expect(404);

      const list = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(
        list.body.find((s: { id: string }) => s.id === created.body.id),
      ).toBeDefined();
    });
  });

  describe('GET /reports/net-worth/snapshots (list + range filter)', () => {
    it('filters by from/to and orders by date ascending', async () => {
      await post(app, '/reports/net-worth/snapshots/bulk', {
        snapshots: [
          { date: '2026-01-01', byCurrency: { UAH: 100 } },
          { date: '2026-02-01', byCurrency: { UAH: 200 } },
          { date: '2026-03-01', byCurrency: { UAH: 300 } },
        ],
      });

      const res = await get(
        app,
        '/reports/net-worth/snapshots?from=2026-02-01&to=2026-02-28',
      ).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].snapshotDate).toBe('2026-02-01');
    });
  });
});
