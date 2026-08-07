import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import {
  createEnvelope,
  EventMeta,
  IEventPublisher,
  kafkaTopic,
} from '@household/contracts';
import { KAFKA_MODULE_OPTIONS } from './kafka.constants';
import { KafkaModuleOptions } from './interfaces/kafka-options.interface';

@Injectable()
export class KafkaProducerService
  implements OnModuleInit, OnModuleDestroy, IEventPublisher
{
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly producer: Producer;
  private connected = false;

  constructor(@Inject(KAFKA_MODULE_OPTIONS) private readonly options: KafkaModuleOptions) {
    const kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
    });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (err) {
      this.logger.warn(
        `Kafka producer failed to connect: ${(err as Error).message}. Events will be skipped.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.connected) await this.producer.disconnect();
  }

  async emit<T extends Record<string, unknown>>(
    eventType: string,
    payload: T,
    meta?: EventMeta,
  ): Promise<void> {
    if (!this.connected) {
      this.logger.warn(`Kafka not connected, skipping: ${eventType}`);
      return;
    }

    const envelope = createEnvelope(eventType, payload, meta);

    try {
      await this.producer.send({
        topic: kafkaTopic(eventType),
        messages: [
          {
            key: meta?.userId ?? envelope.eventId,
            value: JSON.stringify(envelope),
          },
        ],
      });
      this.logger.debug(`Emitted: ${eventType}`);
    } catch (err) {
      this.logger.error(`Failed to emit ${eventType}: ${(err as Error).message}`);
    }
  }
}
