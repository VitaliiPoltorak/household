import { MigrationInterface, QueryRunner } from 'typeorm';

// #292 — push-based sync via Monobank's `POST /personal/webhook`, alongside
// the existing polling (#20/#293). webhook_secret is the per-connection
// bearer embedded in the callback URL path (Monobank webhooks carry no
// signature of their own — see BankConnectionsController's webhook routes).
// webhook_enabled_at is null until BankConnectionsService.enableWebhook()
// confirms Monobank accepted the registration; null means "fall back to
// polling", never a hard requirement to connect a bank.
export class MonobankWebhook1790000000000 implements MigrationInterface {
  name = 'MonobankWebhook1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" ADD "webhook_secret" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" ADD "webhook_enabled_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" DROP COLUMN "webhook_enabled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration"."bank_connections" DROP COLUMN "webhook_secret"`,
    );
  }
}
