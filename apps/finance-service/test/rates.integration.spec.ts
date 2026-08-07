import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '@household/testing';
import { AppModule } from '../src/app.module';
import { PrivatBankClient, type PrivatBankRate } from '../src/rates/clients/privatbank.client';
import { RatesService } from '../src/rates/rates.service';

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

  beforeAll(async () => {
    fakeClient = new FakePrivatBankClient();
    app = await createTestApp(AppModule, (b) =>
      b.overrideProvider(PrivatBankClient).useValue(fakeClient),
    );
    ratesService = app.get(RatesService);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    fakeClient.callCount = 0;
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
});
