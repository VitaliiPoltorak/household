import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceService } from '../presence/presence.service';
import { KafkaBridgeService } from '../kafka/kafka-bridge.service';
import { MembershipService } from '../membership/membership.service';
import { JoinRoomHandler } from './handlers/join-room.handler';
import { LeaveRoomHandler } from './handlers/leave-room.handler';
import { HeartbeatHandler } from './handlers/heartbeat.handler';
import { EditingStartHandler } from './handlers/editing-start.handler';
import { EditingStopHandler } from './handlers/editing-stop.handler';

@Module({
  providers: [
    RealtimeGateway,
    PresenceService,
    KafkaBridgeService,
    MembershipService,
    JoinRoomHandler,
    LeaveRoomHandler,
    HeartbeatHandler,
    EditingStartHandler,
    EditingStopHandler,
  ],
})
export class RealtimeModule {}
