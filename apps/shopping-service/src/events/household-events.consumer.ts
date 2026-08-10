import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KafkaConsumerService } from '@household/kafka';
import { maskId } from '@household/common';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ShoppingList } from '../shopping-lists/entities/shopping-list.entity';

/**
 * Cleans up shopping-schema rows when a household is deleted (issue #83.4).
 * At-least-once delivery, so re-runs are safe (empty delete = no-op).
 *
 * Order: shopping lists (list_items cascade via FK) → products → stores.
 * Wrapped in a single transaction so a mid-purge crash rolls back instead
 * of leaving dangling references.
 */
@Injectable()
export class HouseholdEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(HouseholdEventsConsumer.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async onModuleInit() {
    await this.consumer.subscribe<{ householdId: string }>(
      ['household-deleted'],
      'shopping-household-consumer',
      async (envelope) => {
        const { householdId } = envelope.payload;
        if (!householdId) {
          this.logger.warn('household.deleted event missing householdId — skipping');
          return;
        }

        await this.ds.transaction(async (m) => {
          const lists = await m.getRepository(ShoppingList).delete({ householdId });
          const products = await m.getRepository(Product).delete({ householdId });
          const stores = await m.getRepository(Store).delete({ householdId });
          this.logger.log(
            `Purged shopping for household ${maskId(householdId)}: ` +
              `lists=${lists.affected ?? 0} (items cascade) ` +
              `products=${products.affected ?? 0} stores=${stores.affected ?? 0}`,
          );
        });
      },
    );
  }
}
