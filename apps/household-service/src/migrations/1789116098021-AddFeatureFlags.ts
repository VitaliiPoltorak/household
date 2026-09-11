import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeatureFlags1789116098021 implements MigrationInterface {
  name = 'AddFeatureFlags1789116098021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "household"."feature_flag_overrides_actor_type_enum" AS ENUM('household', 'user')`,
    );
    await queryRunner.query(
      `CREATE TYPE "household"."feature_flag_overrides_source_enum" AS ENUM('manual', 'subscription')`,
    );
    await queryRunner.query(
      `CREATE TABLE "household"."feature_flag_overrides" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "flag_id" uuid NOT NULL, "actor_type" "household"."feature_flag_overrides_actor_type_enum" NOT NULL, "actor_id" character varying NOT NULL, "enabled" boolean NOT NULL, "source" "household"."feature_flag_overrides_source_enum" NOT NULL DEFAULT 'manual', CONSTRAINT "UQ_3e777639601d6a3519f68d8fea4" UNIQUE ("flag_id", "actor_type", "actor_id"), CONSTRAINT "PK_1cf17d8aa221874ceaa1c233315" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "household"."feature_flags_status_enum" AS ENUM('dev', 'beta', 'kill-switch')`,
    );
    await queryRunner.query(
      `CREATE TABLE "household"."feature_flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "flag_key" character varying NOT NULL, "description" character varying NOT NULL, "enabled_default" boolean NOT NULL DEFAULT false, "status" "household"."feature_flags_status_enum" NOT NULL DEFAULT 'dev', "expires_at" TIMESTAMP WITH TIME ZONE, "rollout_issue_url" character varying, CONSTRAINT "UQ_e9f4382e119fbd39d6e052d5f10" UNIQUE ("flag_key"), CONSTRAINT "PK_db657d344e9caacfc9d5cf8bbac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "household"."feature_flag_overrides" ADD CONSTRAINT "FK_ea29d8559861b99fe8ac8bd3ec7" FOREIGN KEY ("flag_id") REFERENCES "household"."feature_flags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "household"."feature_flag_overrides" DROP CONSTRAINT "FK_ea29d8559861b99fe8ac8bd3ec7"`,
    );
    await queryRunner.query(`DROP TABLE "household"."feature_flags"`);
    await queryRunner.query(
      `DROP TYPE "household"."feature_flags_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "household"."feature_flag_overrides"`);
    await queryRunner.query(
      `DROP TYPE "household"."feature_flag_overrides_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "household"."feature_flag_overrides_actor_type_enum"`,
    );
  }
}
