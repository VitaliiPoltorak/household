import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { randomUUID } from 'crypto';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;
  private readonly logger = new Logger(KafkaProducerService.name);
  private connected = false;

  constructor(private readonly config: ConfigService) {
    const kafka = new Kafka({
      clientId: 'auth-service',
      brokers: config
        .get<string>('KAFKA_BROKERS', 'localhost:9092')
        .split(','),
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
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  async emit(eventType: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.connected) {
      this.logger.warn(`Kafka not connected, skipping event: ${eventType}`);
      return;
    }

    const envelope = {
      eventId: randomUUID(),
      eventType,
      userId: payload.userId as string | undefined,
      payload,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.producer.send({
        topic: eventType.replace(/\./g, '-'),
        messages: [
          {
            key: (payload.userId as string) || randomUUID(),
            value: JSON.stringify(envelope),
          },
        ],
      });
      this.logger.log(`Event emitted: ${eventType}`);
    } catch (err) {
      this.logger.error(`Failed to emit ${eventType}: ${(err as Error).message}`);
    }
  }
}
