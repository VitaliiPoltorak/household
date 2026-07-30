import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from '@household/kafka';
import { RealtimeModule } from './gateway/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    KafkaModule.forRootAsync('realtime-gateway'),
    RealtimeModule,
  ],
})
export class AppModule {}
