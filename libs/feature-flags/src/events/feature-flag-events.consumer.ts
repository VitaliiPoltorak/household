import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { KafkaConsumerService } from '@household/kafka';
import {
  FEATURE_FLAG_UPDATED_EVENT,
  kafkaTopic,
  type FeatureFlagUpdatedPayload,
} from '@household/contracts';
import {
  FEATURE_FLAGS_SERVICE_NAME,
  REDIS_CLIENT_TOKEN,
  defaultCacheKey,
  householdCacheKey,
  userCacheKey,
} from '../constants';

/**
 * Invalidates exactly the one cache key a toggle affects — no wildcard scan,
 * because FeatureFlagService caches each actor's state under its own key
 * (see feature-flag.service.ts). Idempotent: deleting an already-absent key
 * is a no-op, satisfying the at-least-once delivery contract
 * (libs/kafka/src/kafka-consumer.service.ts).
 */
@Injectable()
export class FeatureFlagEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagEventsConsumer.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    @Inject(REDIS_CLIENT_TOKEN) private readonly redis: Redis,
    @Inject(FEATURE_FLAGS_SERVICE_NAME) private readonly serviceName: string,
  ) {}

  async onModuleInit() {
    await this.consumer.subscribe<FeatureFlagUpdatedPayload>(
      [kafkaTopic(FEATURE_FLAG_UPDATED_EVENT)],
      `${this.serviceName}-feature-flag-consumer`,
      async (envelope) => {
        const { flagKey, actorType, actorId } = envelope.payload;
        const key =
          actorType === 'household' && actorId
            ? householdCacheKey(flagKey, actorId)
            : actorType === 'user' && actorId
              ? userCacheKey(flagKey, actorId)
              : defaultCacheKey(flagKey);
        await this.redis.del(key);
        this.logger.debug(
          `Invalidated cache for flag '${flagKey}' (${actorType})`,
        );
      },
    );
  }
}
