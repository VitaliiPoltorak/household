import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitAuth1788178255033 implements MigrationInterface {
  name = 'InitAuth1788178255033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backs every @PrimaryGeneratedColumn('uuid') default below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Databases created before migrations existed were materialised by
    // synchronize. Record this migration as applied without re-creating.
    if (await queryRunner.hasTable('auth.users')) return;

    await queryRunner.query(
      `CREATE TABLE "auth"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_user_id" character varying, "household_id" character varying, "action" character varying(100) NOT NULL, "resource_type" character varying(50), "resource_id" character varying, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1c4c8c76598008ea972a84e783" ON "auth"."audit_log" ("actor_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3b3ee70c79f3e72b0af19f1e9" ON "auth"."audit_log" ("household_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_951e6339a77994dfbad976b35c" ON "auth"."audit_log" ("action") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth"."auth_providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "provider" character varying NOT NULL, "provider_user_id" character varying NOT NULL, CONSTRAINT "UQ_23ce9b23329d07057ec8ece6f26" UNIQUE ("provider", "provider_user_id"), CONSTRAINT "PK_cb277e892a115855fc95c373422" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth"."users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "email" character varying NOT NULL, "display_name" character varying NOT NULL, "avatar_url" character varying, "locale" character varying NOT NULL DEFAULT 'en', "password_hash" character varying, "email_verified_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth"."auth_providers" ADD CONSTRAINT "FK_262996fd08ab5a69e85b53d0055" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth"."auth_providers" DROP CONSTRAINT "FK_262996fd08ab5a69e85b53d0055"`,
    );
    await queryRunner.query(`DROP TABLE "auth"."users"`);
    await queryRunner.query(`DROP TABLE "auth"."auth_providers"`);
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_951e6339a77994dfbad976b35c"`,
    );
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_d3b3ee70c79f3e72b0af19f1e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "auth"."IDX_1c4c8c76598008ea972a84e783"`,
    );
    await queryRunner.query(`DROP TABLE "auth"."audit_log"`);
  }
}
