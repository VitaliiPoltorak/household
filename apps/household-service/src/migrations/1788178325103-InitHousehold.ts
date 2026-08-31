import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitHousehold1788178325103 implements MigrationInterface {
  name = 'InitHousehold1788178325103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backs every @PrimaryGeneratedColumn('uuid') default below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Databases created before migrations existed were materialised by
    // synchronize. Record this migration as applied without re-creating.
    if (await queryRunner.hasTable('household.households')) return;

    await queryRunner.query(
      `CREATE TABLE "household"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_user_id" character varying, "household_id" character varying, "action" character varying(100) NOT NULL, "resource_type" character varying(50), "resource_id" character varying, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1c4c8c76598008ea972a84e783" ON "household"."audit_log" ("actor_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3b3ee70c79f3e72b0af19f1e9" ON "household"."audit_log" ("household_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_951e6339a77994dfbad976b35c" ON "household"."audit_log" ("action") `,
    );
    await queryRunner.query(
      `CREATE TYPE "household"."household_members_role_enum" AS ENUM('owner', 'admin', 'member', 'viewer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "household"."household_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" uuid NOT NULL, "user_id" character varying NOT NULL, "role" "household"."household_members_role_enum" NOT NULL DEFAULT 'member', CONSTRAINT "UQ_eda51fd15f360f367e2261c7f5a" UNIQUE ("household_id", "user_id"), CONSTRAINT "PK_198055660706bdbea68909fdb01" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "household"."household_invites_role_enum" AS ENUM('owner', 'admin', 'member', 'viewer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "household"."household_invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" uuid NOT NULL, "email" character varying NOT NULL, "token" character varying NOT NULL, "role" "household"."household_invites_role_enum" NOT NULL DEFAULT 'member', "expires_at" TIMESTAMP NOT NULL, "accepted_at" TIMESTAMP, CONSTRAINT "UQ_236c52b182881a3dc18f0b8345c" UNIQUE ("token"), CONSTRAINT "PK_4dc273129acd034eada7d976d68" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "household"."households" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "created_by" character varying NOT NULL, CONSTRAINT "UQ_47579185dd5c684a7863a4b7a83" UNIQUE ("slug"), CONSTRAINT "PK_2b1aef2640717132e9231aac756" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "household"."household_members" ADD CONSTRAINT "FK_6b8b13e8e04d123ec8cb8b5c318" FOREIGN KEY ("household_id") REFERENCES "household"."households"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "household"."household_invites" ADD CONSTRAINT "FK_2920893d5f9dd81478d777eca20" FOREIGN KEY ("household_id") REFERENCES "household"."households"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "household"."household_invites" DROP CONSTRAINT "FK_2920893d5f9dd81478d777eca20"`,
    );
    await queryRunner.query(
      `ALTER TABLE "household"."household_members" DROP CONSTRAINT "FK_6b8b13e8e04d123ec8cb8b5c318"`,
    );
    await queryRunner.query(`DROP TABLE "household"."households"`);
    await queryRunner.query(`DROP TABLE "household"."household_invites"`);
    await queryRunner.query(
      `DROP TYPE "household"."household_invites_role_enum"`,
    );
    await queryRunner.query(`DROP TABLE "household"."household_members"`);
    await queryRunner.query(
      `DROP TYPE "household"."household_members_role_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "household"."IDX_951e6339a77994dfbad976b35c"`,
    );
    await queryRunner.query(
      `DROP INDEX "household"."IDX_d3b3ee70c79f3e72b0af19f1e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "household"."IDX_1c4c8c76598008ea972a84e783"`,
    );
    await queryRunner.query(`DROP TABLE "household"."audit_log"`);
  }
}
