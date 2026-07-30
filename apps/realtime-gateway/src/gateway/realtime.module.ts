import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceService } from '../presence/presence.service';

@Module({
  providers: [RealtimeGateway, PresenceService],
})
export class RealtimeModule {}
