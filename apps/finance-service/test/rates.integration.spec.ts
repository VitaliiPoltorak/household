import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '@household/testing';
import { AppModule } from '../src/app.module';
import { PrivatBankClient, type PrivatBankRate } from '../src/rates/clients/privatbank.client';
import { RatesService } from '../src/rates/rates.service';
import { RatesRefreshThrottleGuard } from '../src/rates/rates-refresh-throttle.guard';

class FakePrivatBankClient {
  public payload: PrivatBankRate[] = [
    { ccy: 'USD', base_ccy: 'UAH', buy: '41.15', sale: '42.05' },
    { ccy: 'EUR', base_ccy: 'UAH', buy: '45.00', sale: '46.20' },
  ];
  public callCount = 0;
  async fetchRates(): Promise<PrivatBankRate[]> {
    this.callCount++;
    return this.payload;
  }
}

describe('Rates (integration)', () => {
  let app: INestApplication;
  let fakeClient: FakePrivatBankClient;
  let ratesService: RatesService;
  let throttleGuard: RatesRefreshThrottleGuard;

  beforeAll(async () => {
    fakeClient = new FakePrivatBankClient();
    app = await createTestApp(AppModule, (b) =>
      b.overrideProvider(PrivatBankClient).useValue(fakeClient),
    );
    ratesService = app.get(RatesService);
    throttleGuard = app.get(RatesRefreshThrottleGuard);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    fakeClient.callCount = 0;
    // Reset the in-memory throttle window between tests so each starts clean.
    (throttleGuard as unknown as { lastHitByKey: Map<string, number> }).lastHitByKey.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('syncToday()', () => {
    it('inserts today\'s rates from PrivatBank', async () => {
      const res = await ratesService.syncToday();
      expect(res.inserted).toBe(2);

      const latest = await ratesService.findLatest();
      expect(latest).toHaveLength(2);
      expect(latest.map((r) => r.ccy).sort()).toEqual(['EUR', 'USD']);
      expect(latest[0].source).toBe('privatbank');
    });

    it('is idempotent — running twice updates buy/sale without duplicating rows', async () => {
      await ratesService.syncToday();
      fakeClient.payload = [
        { ccy: 'USD', base_ccy: 'UAH', buy: '99.99', sale: '100.00' },
        { ccy: 'EUR', base_ccy: 'UAH', buy: '45.00', sale: '46.20' },
      ];
      await ratesService.syncToday();

      const latest = await ratesService.findLatest();
      expect(latest).toHaveLength(2);
      const usd = latest.find((r) => r.ccy === 'USD')!;
      expect(Number(usd.buy)).toBe(99.99);
    });
  });

  describe('GET /rates/latest', () => {
    it('returns [] when no rates are stored', async () => {
      const res = await request(app.getHttpServer()).get('/rates/latest').expect(200);
      expect(res.body).toEqual([]);
    });

    it('returns latest rates after sync', async () => {
      await ratesService.syncToday();
      const res = await request(app.getHttpServer()).get('/rates/latest').expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        base_ccy: 'UAH',
        source: 'privatbank',
      });
      expect(res.body[0]).toHaveProperty('effective_date');
    });
  });

  describe('GET /rates/history', () => {
    it('rejects missing params', async () => {
      await request(app.getHttpServer()).get('/rates/history').expect(400);
    });

    it('rejects invalid date format', async () => {
      await request(app.getHttpServer())
        .get('/rates/history')
        .query({ ccy: 'USD', from: 'yesterday', to: '2026-08-06' })
        .expect(400);
    });

    it('returns rates for one currency in date range', async () => {
      await ratesService.syncToday();
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .get('/rates/history')
        .query({ ccy: 'USD', from: today, to: today })
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].ccy).toBe('USD');
    });
  });

  describe('POST /rates/refresh', () => {
    it('triggers a sync and returns the freshly-synced rates', async () => {
      const res = await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-1')
        .expect(201);

      expect(res.body).toMatchObject({
        inserted: 2,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(res.body.rates).toHaveLength(2);
      expect(res.body.rates.map((r: { ccy: string }) => r.ccy).sort()).toEqual(['EUR', 'USD']);
      expect(res.body.rates[0]).toMatchObject({ base_ccy: 'UAH', source: 'privatbank' });
      expect(fakeClient.callCount).toBe(1);
    });

    it('reflects updated rates on the next call (upserts by date+source+ccy)', async () => {
      await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-throttle-a')
        .expect(201);

      fakeClient.payload = [
        { ccy: 'USD', base_ccy: 'UAH', buy: '55.55', sale: '56.56' },
        { ccy: 'EUR', base_ccy: 'UAH', buy: '45.00', sale: '46.20' },
      ];

      // Different user so we aren't blocked by the per-user 60s window.
      const res = await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-throttle-b')
        .expect(201);

      const usd = res.body.rates.find((r: { ccy: string }) => r.ccy === 'USD');
      expect(Number(usd.buy)).toBe(55.55);
    });

    it('returns 429 when the same user calls twice within 60s', async () => {
      await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-2')
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-2')
        .expect(429);

      // The shared HttpExceptionFilter normalises `error` from HttpStatus[status]
      // so it comes back UPPERCASE ("TOO MANY REQUESTS"), not the RFC phrase.
      expect(res.body).toMatchObject({
        statusCode: 429,
        error: 'TOO MANY REQUESTS',
      });
      expect(res.body.retryAfter).toBeGreaterThan(0);
      expect(res.body.retryAfter).toBeLessThanOrEqual(60);
      // The blocked call must NOT have hit PrivatBank.
      expect(fakeClient.callCount).toBe(1);
    });

    it('throttles per-user — different users are independent', async () => {
      await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-a')
        .expect(201);

      await request(app.getHttpServer())
        .post('/rates/refresh')
        .set('X-User-Id', 'user-b')
        .expect(201);

      expect(fakeClient.callCount).toBe(2);
    });
  });
});
