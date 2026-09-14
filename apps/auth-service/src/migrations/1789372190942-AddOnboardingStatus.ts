import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the new-user onboarding wizard flag (#347): 'pending' | 'completed' |
 * 'skipped' | 'reviewed_later'. 'pending' is the only value that auto-opens
 * the wizard, so every user who already exists at migration time is
 * backfilled to 'skipped' — they were never shown it and shouldn't be
 * ambushed by it on their next login, but they can still open it manually
 * via the (i) re-entry button.
 *
 * Guarded by hasColumn rather than plain ADD COLUMN IF NOT EXISTS so it
 * self-baselines the same way InitAuth does: a database that `synchronize`
 * already materialised this column on records the migration as applied
 * without re-running DDL.
 */
export class AddOnboardingStatus1789372190942 implements MigrationInterface {
  name = 'AddOnboardingStatus1789372190942';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('auth.users', 'onboarding_status')) {
      return;
    }
    await queryRunner.query(
      `CREATE TYPE "auth"."users_onboarding_status_enum" AS ENUM('pending', 'completed', 'skipped', 'reviewed_later')`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth"."users" ADD "onboarding_status" "auth"."users_onboarding_status_enum" NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `UPDATE "auth"."users" SET "onboarding_status" = 'skipped'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('auth.users', 'onboarding_status'))) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "auth"."users" DROP COLUMN "onboarding_status"`,
    );
    await queryRunner.query(`DROP TYPE "auth"."users_onboarding_status_enum"`);
  }
}
