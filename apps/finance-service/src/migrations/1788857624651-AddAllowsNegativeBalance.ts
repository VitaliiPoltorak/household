import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-account overdraft allowance behind the withdrawal guard (#326).
 *
 * Defaults to false, so every existing account becomes strict: an account that
 * is ALREADY negative keeps its balance (nothing is rewritten) but refuses
 * further withdrawals until someone ticks the allowance. That is the intended
 * direction — the bug this closes let a cash account holding $22.65 be sent to
 * -$999,976.35 by a mistyped transfer.
 *
 * Guarded by hasColumn rather than plain ADD COLUMN IF NOT EXISTS so it
 * self-baselines the same way InitFinance does: a database that `synchronize`
 * already materialised with this column records the migration as applied
 * without re-running DDL.
 */
export class AddAllowsNegativeBalance1788857624651 implements MigrationInterface {
  name = 'AddAllowsNegativeBalance1788857624651';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('finance.accounts', 'allows_negative_balance')) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "finance"."accounts" ADD "allows_negative_balance" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('finance.accounts', 'allows_negative_balance'))) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "finance"."accounts" DROP COLUMN "allows_negative_balance"`,
    );
  }
}
