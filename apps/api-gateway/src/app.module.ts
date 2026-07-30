import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { HealthModule } from './health/health.module';
import { HttpExceptionFilter } from '@household/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { HouseholdIdMiddleware } from './middleware/household-id.middleware';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';

const REDIS_THROTTLER = 'REDIS_THROTTLER';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, REDIS_THROTTLER],
      useFactory: (config: ConfigService, storage: ThrottlerStorage) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
        storage,
      }),
    }),
    HealthModule,
  ],
  providers: [
    {
      provide: REDIS_THROTTLER,
      useFactory: (config: ConfigService) =>
        new RedisThrottlerStorage(
          new Redis({
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            lazyConnect: true,
          }),
        ),
      inject: [ConfigService],
    },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggerMiddleware)
      .forRoutes('*')
      .apply(HouseholdIdMiddleware)
      .forRoutes('*');
  }
}
