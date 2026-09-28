import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ACCOUNT_QUERY_REPOSITORY,
  IAccountQueryRepository,
} from '../reports/query/account-query.repository';
import { ReportsService } from '../reports/reports.service';
import { NetWorthSnapshotsService } from './net-worth-snapshots.service';

/**
 * Auto-captures one net-worth snapshot per household on the 1st of every
 * month (#379), reusing ReportsService.getNetWorth's balance aggregation
 * rather than duplicating it.
 *
 * No leader election: same single-container-deploy reasoning as
 * RecurringPaymentScheduler and integration-service's SyncScheduler. One
 * household's failure (caught per-iteration) must not stop the rest of the
 * batch.
 */
@Injectable()
export class NetWorthSnapshotScheduler {
  private readonly logger = new Logger(NetWorthSnapshotScheduler.name);

  constructor(
    @Inject(ACCOUNT_QUERY_REPOSITORY)
    private readonly accountQuery: IAccountQueryRepository,
    private readonly reports: ReportsService,
    private readonly snapshots: NetWorthSnapshotsService,
  ) {}

  // 04:00 UTC on the 1st — after RecurringPaymentScheduler's 03:00 daily
  // fire, so a same-day recurring payment lands in the very first snapshot
  // of the new month rather than the previous one.
  @Cron('0 4 1 * *', { name: 'captureMonthlyNetWorth', timeZone: 'UTC' })
  async captureAll(): Promise<void> {
    const householdIds = await this.accountQuery.listHouseholdIds();
    if (householdIds.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    this.logger.log(
      `Capturing net-worth snapshots for ${householdIds.length} household(s)`,
    );
    for (const householdId of householdIds) {
      try {
        await this.captureOne(householdId, today);
      } catch (err) {
        this.logger.error(
          `Failed to capture net-worth snapshot for household ${householdId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Public so integration tests can trigger a single household's capture
  // without waiting on the cron interval — same reasoning as
  // RecurringPaymentScheduler.firePayment.
  async captureOne(householdId: string, date: string): Promise<void> {
    const { byCurrency } = await this.reports.getNetWorth(householdId);
    await this.snapshots.captureAuto(householdId, date, byCurrency);
  }
}
