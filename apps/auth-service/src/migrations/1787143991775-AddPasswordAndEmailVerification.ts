import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds manual-auth columns to auth.users:
 *   - password_hash        (bcrypt output, NULL for OAuth-only accounts)
 *   - email_verified_at    (NULL until 6-digit code confirmed)
 *
 * Existing rows are backfilled with email_verified_at = now() because every
 * pre-existing user came in through an OAuth provider that had already
 * verified their mailbox. Without the backfill they would be locked out on
 * next login by the new EMAIL_NOT_VERIFIED gate.
 *
 * Uses IF [NOT] EXISTS so the migration is a no-op on dev databases where
 * TypeORM's synchronize has already materialised the columns from the entity
 * definition — lets us ship this without flipping synchronize off in the
 * same PR (that flip is Phase 3 scope, see docs/PLAN.md).
 */
export class AddPasswordAndEmailVerification1787143991775
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "password_hash" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `UPDATE "auth"."users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth"."users" DROP COLUMN IF EXISTS "email_verified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth"."users" DROP COLUMN IF EXISTS "password_hash"`,
    );
  }
}
