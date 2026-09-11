import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FeatureFlagClientService } from './feature-flag-client.service';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagGuard } from './guard/feature-flag.guard';
import { FeatureFlagEventsConsumer } from './events/feature-flag-events.consumer';
import { FEATURE_FLAGS_SERVICE_NAME } from './constants';

/**
 * Adopts feature flags into a service: installs the @RequireFeature guard
 * globally, and wires cache invalidation via Kafka. Requires the importing
 * app to already provide, both @Global():
 *   - a Redis client under the string token 'REDIS_CLIENT'
 *     (see apps/household-service/src/redis/redis.module.ts)
 *   - KafkaModule.forRootAsync(serviceName)
 *
 * Call FeatureFlagsModule.register('integration-service') from the app's
 * AppModule — the serviceName becomes the Kafka consumer group id.
 */
@Module({})
export class FeatureFlagsModule {
  static register(serviceName: string): DynamicModule {
    return {
      module: FeatureFlagsModule,
      providers: [
        { provide: FEATURE_FLAGS_SERVICE_NAME, useValue: serviceName },
        FeatureFlagClientService,
        FeatureFlagService,
        FeatureFlagEventsConsumer,
        { provide: APP_GUARD, useClass: FeatureFlagGuard },
      ],
      exports: [FeatureFlagService],
    };
  }
}
