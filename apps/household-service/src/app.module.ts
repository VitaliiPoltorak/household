import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from '@household/kafka';
import { RedisModule } from './redis/redis.module';
import { HouseholdsModule } from './households/households.module';
import { Household } from './households/entities/household.entity';
import { HouseholdMember } from './households/entities/household-member.entity';
import { HouseholdInvite } from './households/entities/household-invite.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 5432),
        username: config.get<string>('POSTGRES_USER', 'household'),
        password: config.get<string>('POSTGRES_PASSWORD', 'household_secret'),
        database: config.get<string>('POSTGRES_DB', 'household'),
        schema: 'household',
        entities: [Household, HouseholdMember, HouseholdInvite],
        synchronize: config.get('NODE_ENV') === 'development',
      }),
    }),
    KafkaModule.forRootAsync('household-service'),
    RedisModule,
    HouseholdsModule,
  ],
})
export class AppModule {}
