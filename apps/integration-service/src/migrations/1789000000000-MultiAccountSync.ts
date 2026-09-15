import { MigrationInterface, QueryRunner } from 'typeorm';

// #293 — a Monobank connection can have several accounts/jars under one
// token. Introduces integration.bank_accounts (one row per account/jar),
// points external_transactions at the specific account it came from, adds
// per-run progress tracking to bank_sync_logs, and backfills existing
// single-account connections before dropping the columns they used to live
// on directly. See apps/integration-service/src/bank-connections/entities/
// bank-account.entity.ts for the rationale behind each column.
export class MultiAccountSync1789000000000 implements MigrationInterface {
  name = 'MultiAccountSync1789000000000';

  // Postgres refuses to use a newly-added enum value (even as a column
  // DEFAULT) inside the same transaction that added it ("unsafe use of new
  // value"). This migration both adds 'queued' to bank_sync_logs_status_enum
  // and defaults a column to it, so it opts out of TypeORM's automatic
  // per-migration transaction wrapping — same reason a plain
  // `ALTER TYPE ... ADD VALUE` migration always has to run standalone.
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "integration"."bank_sync_logs_status_enum" ADD VALUE IF NOT EXISTS 'queued'`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" ADD "accounts_total" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" ADD "accounts_done" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" ALTER COLUMN "status" SET DEFAULT 'queued'`,
    );

    await queryRunner.query(
      `CREATE TYPE "integration"."bank_accounts_kind_enum" AS ENUM('account', 'jar')`,
    );
    await queryRunner.query(
      `CREATE TABLE "integration"."bank_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "connection_id" uuid NOT NULL,
        "monobank_account_id" character varying NOT NULL,
        "kind" "integration"."bank_accounts_kind_enum" NOT NULL,
        "masked_pan" character varying,
        "title" character varying,
        "iban" character varying,
        "currency_code" integer,
        "sync_enabled" boolean NOT NULL DEFAULT false,
        "last_sync_at" TIMESTAMP WITH TIME ZONE,
        "last_error" character varying,
        CONSTRAINT "PK_bank_accounts" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_bank_accounts_connection_monobank_id" ON "integration"."bank_accounts" ("connection_id", "monobank_account_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_accounts" ADD CONSTRAINT "FK_bank_accounts_connection" FOREIGN KEY ("connection_id") REFERENCES "integration"."bank_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "integration"."external_transactions" ADD "bank_account_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."external_transactions" ADD CONSTRAINT "FK_external_transactions_bank_account" FOREIGN KEY ("bank_account_id") REFERENCES "integration"."bank_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Backfill: one bank_accounts row per pre-existing connection that had
    // synced an account, carrying over its masked_pan, sync state, and the
    // "this was the account being synced" fact as sync_enabled = true. Rows
    // with no monobank_account_id (a connection that failed before ever
    // syncing) get no bank_accounts row — nothing to sync for them either.
    await queryRunner.query(`
      INSERT INTO "integration"."bank_accounts"
        ("connection_id", "monobank_account_id", "kind", "masked_pan", "sync_enabled", "last_sync_at")
      SELECT "id", "monobank_account_id", 'account', "masked_pan", true, "last_sync_at"
      FROM "integration"."bank_connections"
      WHERE "monobank_account_id" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "integration"."external_transactions" et
      SET "bank_account_id" = ba."id"
      FROM "integration"."bank_accounts" ba
      WHERE ba."connection_id" = et."connection_id" AND et."bank_account_id" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" DROP COLUMN "monobank_account_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" DROP COLUMN "masked_pan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" DROP COLUMN "account_mappings"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" ADD "account_mappings" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" ADD "masked_pan" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" ADD "monobank_account_id" character varying`,
    );

    // Restore from whichever bank_accounts row was flagged as the synced
    // one; if several are enabled (multi-account sync happened), this keeps
    // only one — a rollback across a destructive migration is inherently
    // lossy, which is why README's rollback table calls this row out as
    // needing a database restore, not just an image rollback.
    await queryRunner.query(`
      UPDATE "integration"."bank_connections" bc
      SET "monobank_account_id" = ba."monobank_account_id", "masked_pan" = ba."masked_pan"
      FROM "integration"."bank_accounts" ba
      WHERE ba."connection_id" = bc."id" AND ba."sync_enabled" = true
    `);

    await queryRunner.query(
      `ALTER TABLE "integration"."external_transactions" DROP CONSTRAINT "FK_external_transactions_bank_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."external_transactions" DROP COLUMN "bank_account_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "integration"."bank_accounts" DROP CONSTRAINT "FK_bank_accounts_connection"`,
    );
    await queryRunner.query(
      `DROP INDEX "integration"."UQ_bank_accounts_connection_monobank_id"`,
    );
    await queryRunner.query(`DROP TABLE "integration"."bank_accounts"`);
    await queryRunner.query(
      `DROP TYPE "integration"."bank_accounts_kind_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" ALTER COLUMN "status" SET DEFAULT 'running'`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" DROP COLUMN "accounts_done"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" DROP COLUMN "accounts_total"`,
    );
    // Postgres cannot DROP VALUE from an enum type — 'queued' stays defined
    // but unused after a rollback. Harmless: nothing reads it once the
    // status default reverts to 'running'.
  }
}
