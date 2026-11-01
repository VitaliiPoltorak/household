import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { ReportsService } from '../reports/reports.service';
import { NetWorthSnapshotsService } from './net-worth-snapshots.service';
import { NetWorthSnapshotPromptService } from './net-worth-snapshot-prompt.service';
import { utcDateString } from './snapshot-prompt.dates';

/**
 * Captures the end-of-day net-worth snapshot for every household that pressed
 * "Yes" on the month-end prompt (#406), replacing the blind 1st-of-month
 * capture of #379. Reuses ReportsService.getNetWorth's balance aggregation.
 *
 * Runs just after UTC midnight and snapshots each confirmed-but-uncaptured
 * prompt under its *confirmation day*, so a transaction entered later that
 * same day is included. Because it selects on `captured_at IS NULL`, a missed
 * run is caught up on the next one (the balances are then the current ones,
 * not the historic end-of-day ones — a documented limitation).
 *
 * No leader election: same single-container-deploy reasoning as
 * RecurringPaymentScheduler. One household's failure must not stop the batch.
 */
@Injectable()
export class NetWorthSnapshotScheduler {
  private readonly logger = new Logger(NetWorthSnapshotScheduler.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly snapshots: NetWorthSnapshotsService,
    private readonly prompts: NetWorthSnapshotPromptService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  @Cron('5 0 * * *', { name: 'captureConfirmedNetWorth', timeZone: 'UTC' })
  async captureAll(today: string = utcDateString()): Promise<void> {
    const pending = await this.prompts.listPendingCaptures(today);
    if (pending.length === 0) return;

    this.logger.log(
      `Capturing ${pending.length} confirmed net-worth snapshot(s)`,
    );
    for (const prompt of pending) {
      try {
        await this.captureOne(prompt.householdId, prompt.confirmedOn!);
        await this.prompts.markCaptured(prompt.id);
        await this.events.emit(
          'finance.netWorthSnapshot.created',
          { householdId: prompt.householdId, date: prompt.confirmedOn },
          { householdId: prompt.householdId },
        );
      } catch (err) {
        this.logger.error(
          `Failed to capture net-worth snapshot for household ${prompt.householdId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Public so integration tests can trigger a single household's capture.
  async captureOne(householdId: string, date: string): Promise<void> {
    const { byCurrency } = await this.reports.getNetWorth(householdId);
    await this.snapshots.captureConfirmed(householdId, date, byCurrency);
  }
}
