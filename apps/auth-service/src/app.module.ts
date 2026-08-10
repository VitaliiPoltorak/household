import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from '@household/kafka';
import { ensureSchema } from '@household/database';
import { AuditLog, AuditModule } from '@household/audit';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { User } from './users/entities/user.entity';
import { AuthProvider } from './users/entities/auth-provider.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        await ensureSchema('auth');
        return {
          type: 'postgres' as const,
          host: config.get<string>('POSTGRES_HOST', 'localhost'),
          port: config.get<number>('POSTGRES_PORT', 5432),
          username: config.get<string>('POSTGRES_USER', 'household'),
          password: config.get<string>('POSTGRES_PASSWORD', 'household_secret'),
          database: config.get<string>('POSTGRES_DB', 'household'),
          schema: 'auth',
          entities: [User, AuthProvider, AuditLog],
          synchronize: config.get('NODE_ENV') === 'development',
        };
      },
    }),
    KafkaModule.forRootAsync('auth-service'),
    AuditModule.register(),
    SessionsModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
