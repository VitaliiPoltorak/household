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
import { signMessage, SIGNATURE_HEADER, SIGNATURE_KEY_ID_HEADER } from './signing';

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

  // Raw publish for cases where the caller has already serialized the
  // payload — currently only the DLQ path in KafkaConsumerService. Do not
  // reach for this from application code; use emit() so events go through
  // the shared envelope contract.
  async sendRaw(topic: string, value: string, key?: string): Promise<void> {
    if (!this.connected) {
      this.logger.warn(`Kafka not connected, skipping raw send to ${topic}`);
      return;
    }
    try {
      await this.producer.send({
        topic,
        messages: [{ key: key ?? null, value, headers: this.signatureHeaders(value) }],
      });
    } catch (err) {
      this.logger.error(`Failed raw send to ${topic}: ${(err as Error).message}`);
    }
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
    const value = JSON.stringify(envelope);

    try {
      await this.producer.send({
        topic: kafkaTopic(eventType),
        messages: [
          {
            key: meta?.userId ?? envelope.eventId,
            value,
            headers: this.signatureHeaders(value),
          },
        ],
      });
      this.logger.debug(`Emitted: ${eventType}`);
    } catch (err) {
      this.logger.error(`Failed to emit ${eventType}: ${(err as Error).message}`);
    }
  }

  // Signs the outgoing wire bytes when a signing key is configured (#63).
  // No key → returns undefined so headers stay empty and dev/test workflows
  // (which don't set KAFKA_SIGNING_KEY) keep working unchanged.
  private signatureHeaders(rawValue: string): Record<string, string> | undefined {
    if (!this.options.signingKey) return undefined;
    return {
      [SIGNATURE_HEADER]: signMessage(rawValue, this.options.signingKey),
      [SIGNATURE_KEY_ID_HEADER]: 'primary',
    };
  }
}
