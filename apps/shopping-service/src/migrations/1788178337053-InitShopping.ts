import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitShopping1788178337053 implements MigrationInterface {
  name = 'InitShopping1788178337053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backs every @PrimaryGeneratedColumn('uuid') default below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Databases created before migrations existed were materialised by
    // synchronize. Record this migration as applied without re-creating.
    if (await queryRunner.hasTable('shopping.stores')) return;

    await queryRunner.query(
      `CREATE TYPE "shopping"."stores_type_enum" AS ENUM('supermarket', 'greengrocer', 'pharmacy', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shopping"."stores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "type" "shopping"."stores_type_enum" NOT NULL DEFAULT 'other', "address" character varying, CONSTRAINT "PK_7aa6e7d71fa7acdd7ca43d7c9cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shopping"."products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "category" character varying, "unit" character varying, "preferred_store_id" character varying, "alternative_store_ids" jsonb NOT NULL DEFAULT '[]', "last_price" numeric(10,2), "notes" character varying, "url" character varying, "image_url" character varying, "preview_title" character varying, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shopping"."shopping_list_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "list_id" uuid NOT NULL, "product_id" character varying, "name" character varying NOT NULL, "quantity" numeric(10,2) NOT NULL DEFAULT '1', "unit" character varying, "preferred_store_id" character varying, "actual_store_id" character varying, "is_purchased" boolean NOT NULL DEFAULT false, "price" numeric(10,2), CONSTRAINT "PK_043c112c02fdc1c39fbd619fadb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "shopping"."shopping_lists_status_enum" AS ENUM('active', 'completed', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shopping"."shopping_lists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "household_id" character varying NOT NULL, "name" character varying NOT NULL, "store_id" character varying, "status" "shopping"."shopping_lists_status_enum" NOT NULL DEFAULT 'active', "created_by" character varying NOT NULL, CONSTRAINT "PK_9289ace7dd5e768d65290f3f9de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "shopping"."shopping_list_items" ADD CONSTRAINT "FK_caeede64de0c13c6dd9d3d945cc" FOREIGN KEY ("list_id") REFERENCES "shopping"."shopping_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shopping"."shopping_list_items" DROP CONSTRAINT "FK_caeede64de0c13c6dd9d3d945cc"`,
    );
    await queryRunner.query(`DROP TABLE "shopping"."shopping_lists"`);
    await queryRunner.query(
      `DROP TYPE "shopping"."shopping_lists_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "shopping"."shopping_list_items"`);
    await queryRunner.query(`DROP TABLE "shopping"."products"`);
    await queryRunner.query(`DROP TABLE "shopping"."stores"`);
    await queryRunner.query(`DROP TYPE "shopping"."stores_type_enum"`);
  }
}
