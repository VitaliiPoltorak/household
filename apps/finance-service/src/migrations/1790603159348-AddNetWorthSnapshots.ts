import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNetWorthSnapshots1790603159348 implements MigrationInterface {
    name = 'AddNetWorthSnapshots1790603159348'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "finance"."net_worth_snapshots_source_enum" AS ENUM('auto', 'manual')`);
        await queryRunner.query(`CREATE TABLE "finance"."net_worth_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "snapshot_date" date NOT NULL, "by_currency" jsonb NOT NULL, "source" "finance"."net_worth_snapshots_source_enum" NOT NULL DEFAULT 'manual', CONSTRAINT "PK_c8fa90bccd2310ccf90e3788287" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_net_worth_snapshots_household_date_unique" ON "finance"."net_worth_snapshots" ("household_id", "snapshot_date") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "finance"."idx_net_worth_snapshots_household_date_unique"`);
        await queryRunner.query(`DROP TABLE "finance"."net_worth_snapshots"`);
        await queryRunner.query(`DROP TYPE "finance"."net_worth_snapshots_source_enum"`);
    }

}
