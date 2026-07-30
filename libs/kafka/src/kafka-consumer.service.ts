import { Injectable, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaEventEnvelope } from '@household/contracts';
import { KAFKA_MODULE_OPTIONS } from './kafka.constants';
import { KafkaModuleOptions } from './interfaces/kafka-options.interface';

export type MessageHandler<T = Record<string, unknown>> = (
  envelope: KafkaEventEnvelope<T>,
) => Promise<void>;

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumers: Consumer[] = [];
  private readonly kafka: Kafka;

  constructor(@Inject(KAFKA_MODULE_OPTIONS) private readonly options: KafkaModuleOptions) {
    this.kafka = new Kafka({
      clientId: `${options.clientId}-consumer`,
      brokers: options.brokers,
    });
  }

  async subscribe<T extends Record<string, unknown>>(
    topics: string[],
    groupId: string,
    handler: MessageHandler<T>,
    fromBeginning = false,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });

    try {
      await consumer.connect();
      for (const topic of topics) {
        await consumer.subscribe({ topic, fromBeginning });
      }

      await consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const raw = payload.message.value?.toString();
          if (!raw) return;

          try {
            const envelope = JSON.parse(raw) as KafkaEventEnvelope<T>;
            await handler(envelope);
          } catch (err) {
            this.logger.error(
              `Failed to process message from ${payload.topic}: ${(err as Error).message}`,
            );
          }
        },
      });

      this.consumers.push(consumer);
      this.logger.log(`Subscribed to [${topics.join(', ')}] as group "${groupId}"`);
    } catch (err) {
      this.logger.error(`Failed to subscribe: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.consumers.map((c) => c.disconnect()));
  }
}
