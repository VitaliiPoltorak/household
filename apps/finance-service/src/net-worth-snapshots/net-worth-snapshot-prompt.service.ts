import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import {
  NetWorthSnapshotPrompt,
  SnapshotPromptStatus,
} from './entities/net-worth-snapshot-prompt.entity';
import { addDays, dueMonth, utcDateString } from './snapshot-prompt.dates';

export interface SnapshotPromptState {
  /** True when the bar should be shown right now. */
  show: boolean;
  /** Month (YYYY-MM) the prompt asks about; null when nothing is due. */
  month: string | null;
  snoozedUntil: string | null;
}

/**
 * State machine behind the "Have all incomes for {month} been entered?" bar
 * (#406). Timezone: UTC throughout — the repo has no household timezone, and
 * every other scheduler is UTC, so "today" and "24:00" are UTC calendar days.
 */
@Injectable()
export class NetWorthSnapshotPromptService {
  constructor(
    @InjectRepository(NetWorthSnapshotPrompt)
    private readonly repo: Repository<NetWorthSnapshotPrompt>,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async getState(
    householdId: string,
    today: string = utcDateString(),
  ): Promise<SnapshotPromptState> {
    const month = dueMonth(today);
    const row = await this.repo.findOneBy({ householdId, month });
    return this.toState(month, row, today);
  }

  /** "Yes" — idempotent; a second press keeps the original confirmed_on. */
  async confirm(
    householdId: string,
    userId: string | undefined,
    today: string = utcDateString(),
  ): Promise<SnapshotPromptState> {
    const month = dueMonth(today);
    const existing = await this.repo.findOneBy({ householdId, month });
    if (existing?.status !== SnapshotPromptStatus.CONFIRMED) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(NetWorthSnapshotPrompt)
        .values({
          householdId,
          month,
          status: SnapshotPromptStatus.CONFIRMED,
          confirmedOn: today,
          snoozedUntil: null,
          capturedAt: null,
        })
        .orUpdate(
          ['status', 'confirmed_on', 'snoozed_until', 'captured_at', 'updated_at'],
          ['household_id', 'month'],
        )
        .execute();
      await this.emitUpdated(householdId, userId, month);
    }
    return this.getState(householdId, today);
  }

  /** "Postpone" — hide until tomorrow. A snooze that reaches the next month's
   *  window just lapses: that month is a different row. */
  async snooze(
    householdId: string,
    userId: string | undefined,
    today: string = utcDateString(),
  ): Promise<SnapshotPromptState> {
    const month = dueMonth(today);
    const existing = await this.repo.findOneBy({ householdId, month });
    if (existing?.status !== SnapshotPromptStatus.CONFIRMED) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(NetWorthSnapshotPrompt)
        .values({
          householdId,
          month,
          status: SnapshotPromptStatus.PENDING,
          snoozedUntil: addDays(today, 1),
        })
        .orUpdate(['snoozed_until', 'updated_at'], ['household_id', 'month'])
        .execute();
      await this.emitUpdated(householdId, userId, month);
    }
    return this.getState(householdId, today);
  }

  /** Confirmed prompts whose confirmation day has fully ended and that have
   *  not been captured yet — covers a missed run (catch-up) too. */
  listPendingCaptures(today: string = utcDateString()) {
    return this.repo.find({
      where: {
        status: SnapshotPromptStatus.CONFIRMED,
        capturedAt: IsNull(),
        confirmedOn: LessThan(today),
      },
      order: { confirmedOn: 'ASC' },
    });
  }

  async markCaptured(id: string): Promise<void> {
    await this.repo.update({ id }, { capturedAt: new Date() });
  }

  private toState(
    month: string,
    row: NetWorthSnapshotPrompt | null,
    today: string,
  ): SnapshotPromptState {
    if (row?.status === SnapshotPromptStatus.CONFIRMED) {
      return { show: false, month: null, snoozedUntil: null };
    }
    const snoozedUntil = row?.snoozedUntil ?? null;
    const snoozed = snoozedUntil !== null && snoozedUntil > today;
    return { show: !snoozed, month, snoozedUntil: snoozed ? snoozedUntil : null };
  }

  private emitUpdated(
    householdId: string,
    userId: string | undefined,
    month: string,
  ): Promise<void> {
    return this.events.emit(
      'finance.snapshotPrompt.updated',
      { householdId, month },
      { userId, householdId },
    );
  }
}
