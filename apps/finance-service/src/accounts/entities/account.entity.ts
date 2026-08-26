import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@household/database';

// Case-insensitive uniqueness (#191): name keeps the user's chosen casing for
// display, nameNormalized is the lowercased comparison key. Partial index —
// only non-archived accounts occupy the name, so a user can archive "Cash"
// and later create a fresh "Cash" account without renaming history.
@Index(
  'idx_accounts_household_name_unique',
  ['householdId', 'nameNormalized'],
  {
    unique: true,
    where: '"is_archived" = false',
  },
)
@Entity({ name: 'accounts', schema: 'finance' })
export class Account extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  // Nullable so `synchronize` can ADD COLUMN against a dev database that
  // already has rows — a NOT NULL add would fail outright with no way to
  // backfill (TypeORM migrations are frozen while Phase 3 stabilises, so
  // there's no migration step to backfill existing rows here). Pre-existing
  // accounts keep NULL — and unenforced uniqueness, same as before this
  // change — until they're next created/renamed through the service, which
  // always populates it.
  @Column({ name: 'name_normalized', type: 'varchar', nullable: true })
  nameNormalized: string | null;

  // Was a native Postgres enum; switched to a validated string (#227) —
  // AccountTypesService.assertEnabled is now the authority, matching how
  // #226 handles `currency`. Households can enable/create their own types,
  // which a fixed DB-level enum can't express.
  @Column({ length: 40 })
  type: string;

  // Widened from 3→10 (#226) to allow crypto tickers beyond ISO-4217's 3
  // letters; validity is now enforced by CurrenciesService.assertEnabled,
  // not the column length.
  @Column({ length: 10, default: 'UAH' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  // ─────────────────────────────────────────────────────────────────────
  // Domain methods (Info Expert per #90). Balance is a decimal column and
  // pg returns it as a string; convert at the boundary. Not currently used
  // by any call site — an overdraft-check hook other services can adopt.
  // ─────────────────────────────────────────────────────────────────────

  /** True if this account can cover a withdrawal of `amount` in its currency. */
  canWithdraw(amount: number): boolean {
    return Number(this.balance) >= amount;
  }
}
