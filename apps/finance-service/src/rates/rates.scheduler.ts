import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RatesService } from './rates.service';

@Injectable()
export class RatesScheduler implements OnModuleInit {
  private readonly logger = new Logger(RatesScheduler.name);

  constructor(private readonly rates: RatesService) {}

  /**
   * Warm the cache on startup so the UI never sees an empty rates array
   * during the first day after deploy. Best-effort — a failure here just
   * defers the first successful fetch to the cron.
   */
  async onModuleInit() {
    try {
      const latest = await this.rates.findLatest();
      if (latest.length === 0) {
        this.logger.log('No rates in DB yet — fetching initial snapshot');
        await this.rates.syncToday();
      }
    } catch (err) {
      this.logger.warn(`Initial rates sync failed: ${(err as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: 'Europe/Kyiv' })
  async syncDaily() {
    try {
      await this.rates.syncToday();
    } catch (err) {
      this.logger.error(`Scheduled rates sync failed: ${(err as Error).message}`);
    }
  }
}
