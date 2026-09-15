import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { KafkaModule } from '@household/kafka';
import { ensureSchema } from '@household/database';
import { AuditModule } from '@household/audit';
import { FeatureFlagsModule } from '@household/feature-flags';
import { RedisModule } from './redis/redis.module';
import { BankConnectionsModule } from './bank-connections/bank-connections.module';
import { ExternalTransactionsModule } from './external-transactions/external-transactions.module';
import { EventsModule } from './events/events.module';
import { entities } from './config/entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        await ensureSchema('integration');
        return {
          type: 'postgres' as const,
          host: config.get<string>('POSTGRES_HOST', 'localhost'),
          port: config.get<number>('POSTGRES_PORT', 5432),
          username: config.get<string>('POSTGRES_USER', 'household'),
          password: config.get<string>('POSTGRES_PASSWORD', 'household_secret'),
          database: config.get<string>('POSTGRES_DB', 'household'),
          schema: 'integration',
          entities,
          migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
          migrationsRun: true,
          // 'each' (one transaction per migration, not one across all
          // pending migrations) is what lets MultiAccountSync1789000000000
          // opt itself out of transaction wrapping — Postgres forbids using
          // a newly-added enum value inside the same transaction that added
          // it, and TypeORM only honours a migration's own `transaction`
          // override when the global mode isn't 'all'.
          migrationsTransactionMode: 'each',
          synchronize: false,
        };
      },
    }),
    KafkaModule.forRootAsync('integration-service'),
    ScheduleModule.forRoot(),
    AuditModule.register(),
    RedisModule,
    FeatureFlagsModule.register('integration-service'),
    BankConnectionsModule,
    ExternalTransactionsModule,
    EventsModule,
  ],
})
export class AppModule {}
