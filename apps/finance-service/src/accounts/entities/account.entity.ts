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

  // Whether this account may be driven below zero (#326). Defaults to false,
  // so a typo in an amount field is refused rather than silently booked.
  //
  // Not derived from `type`: account types are household-editable data since
  // #227 (a household can coin its own codes), so a hardcoded
  // "cash and deposit are the strict ones" table would be wrong the moment
  // someone adds "credit card" or "overdraft". The allowance is a property of
  // the individual account, which is also where the user's knowledge lives —
  // one of their two bank accounts may have an arranged overdraft and the
  // other may not.
  @Column({ name: 'allows_negative_balance', default: false })
  allowsNegativeBalance: boolean;

  // ─────────────────────────────────────────────────────────────────────
  // Domain methods (Info Expert per #90). Balance is a decimal column and
  // pg returns it as a string; convert at the boundary.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * True if this account can cover a withdrawal of `amount` in its currency.
   *
   * This is the readable statement of the rule, and what the unit tests pin.
   * It is NOT the enforcement point: a read-then-write against a loaded entity
   * would race a concurrent withdrawal between the check and the balance
   * update. AccountsService.adjustBalance enforces the same predicate as a
   * WHERE clause on the balance-mutating UPDATE itself — see the comment
   * there. Keep the two in step.
   */
  canWithdraw(amount: number): boolean {
    return this.allowsNegativeBalance || Number(this.balance) >= amount;
  }
}
