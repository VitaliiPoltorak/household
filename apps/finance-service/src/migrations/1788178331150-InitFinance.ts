import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitFinance1788178331150 implements MigrationInterface {
  name = 'InitFinance1788178331150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backs every @PrimaryGeneratedColumn('uuid') default below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Databases created before migrations existed were materialised by
    // synchronize. Record this migration as applied without re-creating.
    if (await queryRunner.hasTable('finance.accounts')) return;

    await queryRunner.query(
      `CREATE TABLE "finance"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_user_id" character varying, "household_id" character varying, "action" character varying(100) NOT NULL, "resource_type" character varying(50), "resource_id" character varying, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1c4c8c76598008ea972a84e783" ON "finance"."audit_log" ("actor_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3b3ee70c79f3e72b0af19f1e9" ON "finance"."audit_log" ("household_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_951e6339a77994dfbad976b35c" ON "finance"."audit_log" ("action") `,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "name_normalized" character varying, "type" character varying(40) NOT NULL, "currency" character varying(10) NOT NULL DEFAULT 'UAH', "balance" numeric(15,2) NOT NULL DEFAULT '0', "external_id" character varying, "is_archived" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_accounts_household_name_unique" ON "finance"."accounts" ("household_id", "name_normalized") WHERE "is_archived" = false`,
    );
    await queryRunner.query(
      `CREATE TYPE "finance"."transactions_type_enum" AS ENUM('income', 'expense', 'transfer', 'adjustment')`,
    );
    await queryRunner.query(
      `CREATE TYPE "finance"."transactions_transfer_direction_enum" AS ENUM('debit', 'credit')`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "account_id" character varying NOT NULL, "type" "finance"."transactions_type_enum" NOT NULL, "amount" numeric(15,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'UAH', "category_id" character varying, "income_source_id" character varying, "description" character varying, "date" date NOT NULL, "external_id" character varying, "created_by" character varying NOT NULL, "transfer_pair_id" character varying, "transfer_direction" "finance"."transactions_transfer_direction_enum", CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "finance"."transaction_categories_type_enum" AS ENUM('income', 'expense')`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."transaction_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "type" "finance"."transaction_categories_type_enum" NOT NULL, "icon" character varying, "parent_id" character varying, "is_archived" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_bbd38b9174546b0ed4fe04689c7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "finance"."income_sources_type_enum" AS ENUM('salary', 'project', 'dividend', 'rent', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."income_sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "type" "finance"."income_sources_type_enum" NOT NULL, CONSTRAINT "PK_5e2bc8bfe0ee6a3e4726bdf0d79" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "finance"."recurring_payments_frequency_enum" AS ENUM('weekly', 'monthly', 'yearly')`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."recurring_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "amount" numeric(15,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'UAH', "category_id" character varying, "frequency" "finance"."recurring_payments_frequency_enum" NOT NULL, "next_due_date" date NOT NULL, "account_id" character varying, CONSTRAINT "PK_bbce8e2920bd6ee89a7c4ebf78a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."exchange_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ccy" character varying(3) NOT NULL, "base_ccy" character varying(3) NOT NULL, "buy" numeric(18,6) NOT NULL, "sale" numeric(18,6) NOT NULL, "source" character varying(32) NOT NULL, "effective_date" date NOT NULL, "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_33a614bad9e61956079d817ebe2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_rate_per_day" ON "finance"."exchange_rates" ("effective_date", "source", "ccy", "base_ccy") `,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."currencies" ("code" character varying(10) NOT NULL, "name" character varying NOT NULL, "symbol" character varying, "is_crypto" boolean NOT NULL DEFAULT false, "decimals" integer NOT NULL DEFAULT '2', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9f8d0972aeeb5a2277e40332d29" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."household_currencies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "household_id" character varying NOT NULL, "currency_code" character varying(10) NOT NULL, "enabled_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_20cb9b312a7d9c5e91e28de0494" UNIQUE ("household_id", "currency_code"), CONSTRAINT "PK_0b6f4c2358662adae94ddceeeeb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."account_types" ("code" character varying(40) NOT NULL, "label" character varying NOT NULL, "icon" character varying, "is_system" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_84e618430829bbead2df50a6b34" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance"."household_account_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "household_id" character varying NOT NULL, "type_code" character varying(40) NOT NULL, "enabled_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3ced16337dadf4f99d5afcee928" UNIQUE ("household_id", "type_code"), CONSTRAINT "PK_0ca65176f3ae4f6d13be0d24dea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance"."household_currencies" ADD CONSTRAINT "FK_6e58cd4654af9f412954783ac7c" FOREIGN KEY ("currency_code") REFERENCES "finance"."currencies"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance"."household_account_types" ADD CONSTRAINT "FK_a6b004994d0802f013c74c26f84" FOREIGN KEY ("type_code") REFERENCES "finance"."account_types"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "finance"."household_account_types" DROP CONSTRAINT "FK_a6b004994d0802f013c74c26f84"`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance"."household_currencies" DROP CONSTRAINT "FK_6e58cd4654af9f412954783ac7c"`,
    );
    await queryRunner.query(`DROP TABLE "finance"."household_account_types"`);
    await queryRunner.query(`DROP TABLE "finance"."account_types"`);
    await queryRunner.query(`DROP TABLE "finance"."household_currencies"`);
    await queryRunner.query(`DROP TABLE "finance"."currencies"`);
    await queryRunner.query(`DROP INDEX "finance"."uq_rate_per_day"`);
    await queryRunner.query(`DROP TABLE "finance"."exchange_rates"`);
    await queryRunner.query(`DROP TABLE "finance"."recurring_payments"`);
    await queryRunner.query(
      `DROP TYPE "finance"."recurring_payments_frequency_enum"`,
    );
    await queryRunner.query(`DROP TABLE "finance"."income_sources"`);
    await queryRunner.query(`DROP TYPE "finance"."income_sources_type_enum"`);
    await queryRunner.query(`DROP TABLE "finance"."transaction_categories"`);
    await queryRunner.query(
      `DROP TYPE "finance"."transaction_categories_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "finance"."transactions"`);
    await queryRunner.query(
      `DROP TYPE "finance"."transactions_transfer_direction_enum"`,
    );
    await queryRunner.query(`DROP TYPE "finance"."transactions_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "finance"."idx_accounts_household_name_unique"`,
    );
    await queryRunner.query(`DROP TABLE "finance"."accounts"`);
    await queryRunner.query(
      `DROP INDEX "finance"."IDX_951e6339a77994dfbad976b35c"`,
    );
    await queryRunner.query(
      `DROP INDEX "finance"."IDX_d3b3ee70c79f3e72b0af19f1e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "finance"."IDX_1c4c8c76598008ea972a84e783"`,
    );
    await queryRunner.query(`DROP TABLE "finance"."audit_log"`);
  }
}
