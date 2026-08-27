import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from '@household/kafka';
import { ensureSchema } from '@household/database';
import { AuditLog, AuditModule } from '@household/audit';
import { RedisModule } from './redis/redis.module';
import { BankConnectionsModule } from './bank-connections/bank-connections.module';
import { ExternalTransactionsModule } from './external-transactions/external-transactions.module';
import { EventsModule } from './events/events.module';
import { BankConnection } from './bank-connections/entities/bank-connection.entity';
import { BankSyncLog } from './bank-connections/entities/bank-sync-log.entity';
import { ExternalTransaction } from './external-transactions/entities/external-transaction.entity';

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
          entities: [
            BankConnection,
            BankSyncLog,
            ExternalTransaction,
            AuditLog,
          ],
          synchronize: config.get('NODE_ENV') === 'development',
        };
      },
    }),
    KafkaModule.forRootAsync('integration-service'),
    AuditModule.register(),
    RedisModule,
    BankConnectionsModule,
    ExternalTransactionsModule,
    EventsModule,
  ],
})
export class AppModule {}
