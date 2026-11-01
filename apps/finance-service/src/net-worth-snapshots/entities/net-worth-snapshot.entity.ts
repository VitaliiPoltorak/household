import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum NetWorthSnapshotSource {
  AUTO = 'auto',
  MANUAL = 'manual',
  // Captured at end of day after the user answered "Yes" to the month-end
  // prompt (#406). Replaces the 1st-of-month `auto` capture for new months.
  CONFIRMED = 'confirmed',
}

/**
 * One net-worth snapshot per household per calendar date (#379). The
 * confirmed end-of-day capture (#406; formerly the monthly auto capture) and
 * a manual entry both write through the same
 * upsert, keyed by (household_id, snapshot_date) — a manual correction of an
 * auto-captured month reconciles the existing row instead of duplicating it.
 */
@Index(
  'idx_net_worth_snapshots_household_date_unique',
  ['householdId', 'snapshotDate'],
  { unique: true },
)
@Entity({ name: 'net_worth_snapshots', schema: 'finance' })
export class NetWorthSnapshot extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: string;

  // Same shape as ReportsService.getNetWorth's byCurrency, e.g.
  // {"UAH": 45000, "USD": 1200}.
  @Column({ name: 'by_currency', type: 'jsonb' })
  byCurrency: Record<string, number>;

  @Column({
    type: 'enum',
    enum: NetWorthSnapshotSource,
    default: NetWorthSnapshotSource.MANUAL,
  })
  source: NetWorthSnapshotSource;
}
