import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
} from '@household/testing';
import { AppModule } from '../src/app.module';
import { NetWorthSnapshotScheduler } from '../src/net-worth-snapshots/net-worth-snapshot.scheduler';

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

  describe('Scheduler — auto-capture (#379)', () => {
    it('captures one snapshot per household, reusing getNetWorth balances', async () => {
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureOne(H, '2026-08-01');

      const res = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        householdId: H,
        snapshotDate: '2026-08-01',
        byCurrency: { UAH: 5000 },
        source: 'auto',
      });
    });

    it('is idempotent — a second capture for the same date upserts, not duplicates', async () => {
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureOne(H, '2026-08-01');
      await post(app, '/transactions', {
        accountId,
        type: 'income',
        amount: 1000,
        currency: 'UAH',
        date: '2026-08-01',
      });
      await scheduler.captureOne(H, '2026-08-01');

      const res = await get(app, '/reports/net-worth/snapshots').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].byCurrency.UAH).toBeCloseTo(6000);
    });

    it('skips a household with no active accounts instead of storing an empty snapshot', async () => {
      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureOne('household-with-no-accounts', '2026-08-01');

      const res = await get(
        app,
        '/reports/net-worth/snapshots',
        'household-with-no-accounts',
      ).expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('captureAll walks every household with at least one account', async () => {
      await post(
        app,
        '/accounts',
        { name: 'Other Bank', type: 'bank', currency: 'UAH' },
        H2,
      );

      const scheduler = app.get(NetWorthSnapshotScheduler);
      await scheduler.captureAll();

      const h1 = await get(app, '/reports/net-worth/snapshots', H).expect(200);
      const h2 = await get(app, '/reports/net-worth/snapshots', H2).expect(200);
      expect(h1.body).toHaveLength(1);
      expect(h1.body[0].byCurrency.UAH).toBeCloseTo(5000);
      // H2's only account has a zero balance — still a valid snapshot.
      expect(h2.body).toHaveLength(1);
      expect(h2.body[0].byCurrency.UAH).toBeCloseTo(0);
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
