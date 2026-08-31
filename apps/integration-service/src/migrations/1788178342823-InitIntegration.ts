import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitIntegration1788178342823 implements MigrationInterface {
  name = 'InitIntegration1788178342823';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backs every @PrimaryGeneratedColumn('uuid') default below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Databases created before migrations existed were materialised by
    // synchronize. Record this migration as applied without re-creating.
    if (await queryRunner.hasTable('integration.bank_connections')) return;

    await queryRunner.query(
      `CREATE TABLE "integration"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_user_id" character varying, "household_id" character varying, "action" character varying(100) NOT NULL, "resource_type" character varying(50), "resource_id" character varying, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1c4c8c76598008ea972a84e783" ON "integration"."audit_log" ("actor_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3b3ee70c79f3e72b0af19f1e9" ON "integration"."audit_log" ("household_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_951e6339a77994dfbad976b35c" ON "integration"."audit_log" ("action") `,
    );
    await queryRunner.query(
      `CREATE TYPE "integration"."bank_connections_provider_enum" AS ENUM('monobank')`,
    );
    await queryRunner.query(
      `CREATE TYPE "integration"."bank_connections_status_enum" AS ENUM('active', 'error', 'disconnected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "integration"."bank_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "provider" "integration"."bank_connections_provider_enum" NOT NULL DEFAULT 'monobank', "token_encrypted" text NOT NULL, "monobank_client_id" character varying, "monobank_account_id" character varying, "masked_pan" character varying, "account_mappings" jsonb NOT NULL DEFAULT '{}', "last_sync_at" TIMESTAMP WITH TIME ZONE, "status" "integration"."bank_connections_status_enum" NOT NULL DEFAULT 'active', CONSTRAINT "PK_e819ec14a4c20543aec5749da80" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b09dea37016c0651ab8af98589" ON "integration"."bank_connections" ("household_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "integration"."bank_sync_logs_status_enum" AS ENUM('running', 'success', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "integration"."bank_sync_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "connection_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE, "status" "integration"."bank_sync_logs_status_enum" NOT NULL DEFAULT 'running', "error" character varying, "transactions_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_31d2653e92d9182bec0878b7961" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "integration"."external_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "connection_id" uuid NOT NULL, "external_id" character varying NOT NULL, "raw_data" jsonb NOT NULL, "mapped_transaction_id" character varying, CONSTRAINT "PK_247f1f7372e938562959bef7718" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_753e1043f1dfe28d42e1e6498e" ON "integration"."external_transactions" ("connection_id", "external_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" ADD CONSTRAINT "FK_4e17b6a1c63bf0ecdc4cd629eb5" FOREIGN KEY ("connection_id") REFERENCES "integration"."bank_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."external_transactions" ADD CONSTRAINT "FK_75fc70da34752a8ed31aa8dd1a1" FOREIGN KEY ("connection_id") REFERENCES "integration"."bank_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration"."external_transactions" DROP CONSTRAINT "FK_75fc70da34752a8ed31aa8dd1a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_sync_logs" DROP CONSTRAINT "FK_4e17b6a1c63bf0ecdc4cd629eb5"`,
    );
    await queryRunner.query(
      `DROP INDEX "integration"."IDX_753e1043f1dfe28d42e1e6498e"`,
    );
    await queryRunner.query(`DROP TABLE "integration"."external_transactions"`);
    await queryRunner.query(`DROP TABLE "integration"."bank_sync_logs"`);
    await queryRunner.query(
      `DROP TYPE "integration"."bank_sync_logs_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "integration"."IDX_b09dea37016c0651ab8af98589"`,
    );
    await queryRunner.query(`DROP TABLE "integration"."bank_connections"`);
    await queryRunner.query(
      `DROP TYPE "integration"."bank_connections_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "integration"."bank_connections_provider_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "integration"."IDX_951e6339a77994dfbad976b35c"`,
    );
    await queryRunner.query(
      `DROP INDEX "integration"."IDX_d3b3ee70c79f3e72b0af19f1e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "integration"."IDX_1c4c8c76598008ea972a84e783"`,
    );
    await queryRunner.query(`DROP TABLE "integration"."audit_log"`);
  }
}
