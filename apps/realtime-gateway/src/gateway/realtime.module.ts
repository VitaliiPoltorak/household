import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceService } from '../presence/presence.service';
import { KafkaBridgeService } from '../kafka/kafka-bridge.service';
import { MembershipService } from '../membership/membership.service';

@Module({
  providers: [RealtimeGateway, PresenceService, KafkaBridgeService, MembershipService],
})
export class RealtimeModule {}
