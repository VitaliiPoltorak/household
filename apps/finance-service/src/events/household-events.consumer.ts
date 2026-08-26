import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KafkaConsumerService } from '@household/kafka';
import { maskId } from '@household/common';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { IncomeSource } from '../income-sources/entities/income-source.entity';
import { RecurringPayment } from '../recurring-payments/entities/recurring-payment.entity';
import { CurrenciesService } from '../currencies/currencies.service';

/**
 * Bridges household-service lifecycle events into finance-schema side effects.
 *
 * `household.created` (#226) seeds the default enabled-currency set —
 * idempotent, so at-least-once redelivery is safe.
 *
 * `household.deleted` (#83.4) cleans up finance-schema rows. Delivery is
 * at-least-once, so the transaction re-runs safely: a second delete of an
 * already-empty household is a no-op.
 *
 * Order matters: transactions first (they reference accounts + categories),
 * then recurring payments (reference accounts + categories), then accounts,
 * categories, and income sources. Wrapped in a DB transaction so a partial
 * failure leaves either the whole household intact or fully purged.
 */
@Injectable()
export class HouseholdEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(HouseholdEventsConsumer.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly currencies: CurrenciesService,
  ) {}

  async onModuleInit() {
    await this.consumer.subscribe<{ householdId: string }>(
      ['household-created'],
      'finance-household-created-consumer',
      async (envelope) => {
        const { householdId } = envelope.payload;
        if (!householdId) {
          this.logger.warn(
            'household.created event missing householdId — skipping',
          );
          return;
        }
        await this.currencies.seedDefaults(householdId);
      },
    );

    await this.consumer.subscribe<{ householdId: string }>(
      ['household-deleted'],
      'finance-household-consumer',
      async (envelope) => {
        const { householdId } = envelope.payload;
        if (!householdId) {
          this.logger.warn(
            'household.deleted event missing householdId — skipping',
          );
          return;
        }

        await this.ds.transaction(async (m) => {
          const tx = await m.getRepository(Transaction).delete({ householdId });
          const rp = await m
            .getRepository(RecurringPayment)
            .delete({ householdId });
          const ac = await m.getRepository(Account).delete({ householdId });
          const ct = await m.getRepository(Category).delete({ householdId });
          const is = await m
            .getRepository(IncomeSource)
            .delete({ householdId });
          this.logger.log(
            `Purged finance for household ${maskId(householdId)}: ` +
              `transactions=${tx.affected ?? 0} recurring=${rp.affected ?? 0} ` +
              `accounts=${ac.affected ?? 0} categories=${ct.affected ?? 0} ` +
              `incomeSources=${is.affected ?? 0}`,
          );
        });
      },
    );
  }
}
