import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Case-insensitive uniqueness for category names (#325).
 *
 * Two things depend on this index. The obvious one is that a household should
 * not end up with two "Groceries" now that categories can actually be created
 * from the UI. The less obvious one is idempotent seeding: the household
 * defaults are inserted with `.orIgnore()`, which needs a unique constraint to
 * conflict against — without it an at-least-once redelivery of
 * `household.created` hands the household a second full set of defaults.
 *
 * The backfill is safe on existing data: because category creation was
 * unreachable from the UI (that is the bug this closes), essentially no
 * household has any. Should a duplicate pair exist anyway, CREATE UNIQUE INDEX
 * fails loudly and the deploy stops — which is the right outcome, since
 * silently dropping one of two real categories would lose the transactions
 * labelled with it.
 */
export class AddCategoryNameUniqueness1788899443370 implements MigrationInterface {
  name = 'AddCategoryNameUniqueness1788899443370';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Self-baselining, same as the other migrations here: a database that
    // `synchronize` already materialised records this as applied without
    // re-running the DDL.
    const hasColumn = await queryRunner.hasColumn(
      'finance.transaction_categories',
      'name_normalized',
    );
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "finance"."transaction_categories" ADD "name_normalized" character varying`,
      );
      await queryRunner.query(
        `UPDATE "finance"."transaction_categories" SET "name_normalized" = lower(btrim("name"))`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_household_type_name_unique"
         ON "finance"."transaction_categories" ("household_id", "type", "name_normalized")
       WHERE "is_archived" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "finance"."idx_categories_household_type_name_unique"`,
    );
    if (
      await queryRunner.hasColumn('finance.transaction_categories', 'name_normalized')
    ) {
      await queryRunner.query(
        `ALTER TABLE "finance"."transaction_categories" DROP COLUMN "name_normalized"`,
      );
    }
  }
}
