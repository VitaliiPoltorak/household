import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum SnapshotPromptStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
}

/**
 * Per-household, per-month state of the "Have all incomes for {month} been
 * entered?" prompt (#406). No row exists until the household snoozes or
 * confirms — a month's prompt is *due* purely by date (see
 * snapshot-prompt.dates.ts).
 */
@Index(
  'idx_net_worth_snapshot_prompts_household_month_unique',
  ['householdId', 'month'],
  { unique: true },
)
@Entity({ name: 'net_worth_snapshot_prompts', schema: 'finance' })
export class NetWorthSnapshotPrompt extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  // YYYY-MM — the month being asked about.
  @Column({ type: 'varchar', length: 7 })
  month: string;

  @Column({
    type: 'enum',
    enum: SnapshotPromptStatus,
    default: SnapshotPromptStatus.PENDING,
  })
  status: SnapshotPromptStatus;

  // Hidden while snoozed_until > today (UTC date).
  @Column({ name: 'snoozed_until', type: 'date', nullable: true })
  snoozedUntil: string | null;

  // UTC date the user pressed Yes — also the snapshot's snapshot_date.
  @Column({ name: 'confirmed_on', type: 'date', nullable: true })
  confirmedOn: string | null;

  // Set once the end-of-day capture has run, so a catch-up never re-captures
  // (and never resurrects a snapshot the user deleted).
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;
}
