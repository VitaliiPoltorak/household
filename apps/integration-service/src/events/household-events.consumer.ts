import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaConsumerService } from '@household/kafka';
import { maskId } from '@household/common';
import { BankConnection } from '../bank-connections/entities/bank-connection.entity';

/**
 * Cleans up integration-schema rows when a household is deleted (issue
 * #83.4 pattern, mirrored from shopping-service). At-least-once delivery,
 * so re-runs are safe (empty delete = no-op). bank_sync_logs and
 * external_transactions cascade via ON DELETE CASCADE on connection_id, so
 * deleting bank_connections is sufficient.
 *
 * Deliberately NOT gated behind the 'monobank-integration' flag — this is a
 * data-retention obligation, not Monobank traffic. Dropping it while the
 * flag is off would silently consume-and-discard household.deleted events
 * (at-least-once delivery means they're not replayed), leaving orphaned
 * encrypted bank tokens for households that no longer exist.
 */
@Injectable()
export class HouseholdEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(HouseholdEventsConsumer.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    @InjectRepository(BankConnection)
    private readonly connectionRepo: Repository<BankConnection>,
  ) {}

  async onModuleInit() {
    await this.consumer.subscribe<{ householdId: string }>(
      ['household-deleted'],
      'integration-household-consumer',
      async (envelope) => {
        const { householdId } = envelope.payload;
        if (!householdId) {
          this.logger.warn(
            'household.deleted event missing householdId — skipping',
          );
          return;
        }

        const result = await this.connectionRepo.delete({ householdId });
        this.logger.log(
          `Purged integration for household ${maskId(householdId)}: connections=${result.affected ?? 0}`,
        );
      },
    );
  }
}
