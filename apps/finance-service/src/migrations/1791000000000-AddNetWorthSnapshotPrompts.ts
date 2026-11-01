import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNetWorthSnapshotPrompts1791000000000 implements MigrationInterface {
    name = 'AddNetWorthSnapshotPrompts1791000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "finance"."net_worth_snapshots_source_enum" ADD VALUE IF NOT EXISTS 'confirmed'`);
        await queryRunner.query(`CREATE TYPE "finance"."net_worth_snapshot_prompts_status_enum" AS ENUM('pending', 'confirmed')`);
        await queryRunner.query(`CREATE TABLE "finance"."net_worth_snapshot_prompts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "month" character varying(7) NOT NULL, "status" "finance"."net_worth_snapshot_prompts_status_enum" NOT NULL DEFAULT 'pending', "snoozed_until" date, "confirmed_on" date, "captured_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_net_worth_snapshot_prompts" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_net_worth_snapshot_prompts_household_month_unique" ON "finance"."net_worth_snapshot_prompts" ("household_id", "month") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "finance"."idx_net_worth_snapshot_prompts_household_month_unique"`);
        await queryRunner.query(`DROP TABLE "finance"."net_worth_snapshot_prompts"`);
        await queryRunner.query(`DROP TYPE "finance"."net_worth_snapshot_prompts_status_enum"`);
        // The 'confirmed' value on net_worth_snapshots_source_enum is left in
        // place: Postgres cannot drop an enum value, and an unused value is harmless.
    }

}
