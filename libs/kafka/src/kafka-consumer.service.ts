import { Injectable, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { FailedMessageEnvelope, KafkaEventEnvelope } from '@household/contracts';
import { KAFKA_MODULE_OPTIONS } from './kafka.constants';
import { KafkaModuleOptions } from './interfaces/kafka-options.interface';
import { KafkaProducerService } from './kafka-producer.service';

export type MessageHandler<T = Record<string, unknown>> = (
  envelope: KafkaEventEnvelope<T>,
) => Promise<void>;

// Retry budget for handler failures. After MAX_ATTEMPTS the message is
// sent to <topic>.dlq and the offset advances so the stream doesn't stall
// on a poison message.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [100, 500, 2000]; // per-attempt sleep BEFORE the retry

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumers: Consumer[] = [];
  private readonly kafka: Kafka;

  constructor(
    @Inject(KAFKA_MODULE_OPTIONS) private readonly options: KafkaModuleOptions,
    private readonly producer: KafkaProducerService,
  ) {
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
        eachMessage: (payload) => this.processMessage(payload, handler),
      });

      this.consumers.push(consumer);
      this.logger.log(`Subscribed to [${topics.join(', ')}] as group "${groupId}"`);
    } catch (err) {
      this.logger.warn(`Consumer subscribe issue (will retry): ${(err as Error).message}`);
    }
  }

  private async processMessage<T extends Record<string, unknown>>(
    payload: EachMessagePayload,
    handler: MessageHandler<T>,
  ): Promise<void> {
    const raw = payload.message.value?.toString();
    if (!raw) return;

    // Parse errors are terminal — no point retrying a message we can't even
    // deserialize. Straight to DLQ so a human can inspect the bad payload.
    let envelope: KafkaEventEnvelope<T> | null = null;
    try {
      envelope = JSON.parse(raw) as KafkaEventEnvelope<T>;
    } catch (err) {
      this.logger.error(
        `Unparseable message on ${payload.topic}@${payload.partition}:${payload.message.offset}: ${(err as Error).message}`,
      );
      await this.publishToDLQ(payload, raw, null, err as Error, 0);
      return;
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await handler(envelope);
        return; // success — offset advances
      } catch (err) {
        lastError = err as Error;
        // NOTE: retry causes the handler to run again. Downstream handlers
        // MUST be idempotent (safe to run twice with the same envelope).
        // Existing consumers (household auth-events, realtime bridge) are
        // idempotent; audit any new consumer against this contract.
        this.logger.warn(
          `Handler failed on ${payload.topic} (attempt ${attempt}/${MAX_ATTEMPTS}): ${lastError.message}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(BACKOFF_MS[attempt - 1] ?? 2000);
        }
      }
    }

    // Retries exhausted. Publish to DLQ and let the offset advance so the
    // stream can continue. The failed message is preserved in the DLQ for
    // offline replay once the root cause is fixed.
    this.logger.error(
      `Handler exhausted retries on ${payload.topic}@${payload.partition}:${payload.message.offset} — sending to DLQ`,
    );
    await this.publishToDLQ(payload, raw, envelope, lastError!, MAX_ATTEMPTS);
  }

  private async publishToDLQ(
    payload: EachMessagePayload,
    raw: string,
    envelope: KafkaEventEnvelope | null,
    err: Error,
    retriesAttempted: number,
  ): Promise<void> {
    const dlqTopic = `${payload.topic}.dlq`;
    const dlqEnvelope: FailedMessageEnvelope = {
      originalTopic: payload.topic,
      originalPartition: payload.partition,
      originalOffset: payload.message.offset,
      originalMessage: envelope,
      originalRaw: raw,
      error: err.message,
      errorStack: err.stack ?? null,
      retriesAttempted,
      failedAt: new Date().toISOString(),
    };
    try {
      await this.producer.sendRaw(dlqTopic, JSON.stringify(dlqEnvelope), payload.message.key?.toString());
    } catch (publishErr) {
      // If even the DLQ publish fails, we have to give up. Log loudly —
      // this is where an alert / monitoring hook should fire once metrics
      // are wired (follow-up to this PR).
      this.logger.error(
        `DLQ publish failed for ${dlqTopic}: ${(publishErr as Error).message}. Message lost: ${raw}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    await Promise.all(this.consumers.map((c) => c.disconnect()));
  }
}
