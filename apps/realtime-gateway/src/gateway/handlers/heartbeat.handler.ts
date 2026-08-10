import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { MembershipService } from '../../membership/membership.service';
import { PresenceService } from '../../presence/presence.service';
import { MessageHandler } from './message-handler.interface';

export interface HeartbeatPayload {
  householdId: string;
}

@Injectable()
export class HeartbeatHandler implements MessageHandler<HeartbeatPayload> {
  constructor(
    private readonly presence: PresenceService,
    private readonly membership: MembershipService,
  ) {}

  async handle(client: Socket, payload: HeartbeatPayload): Promise<void> {
    const userId = client.data.userId as string;
    if (!(await this.membership.isMember(userId, payload.householdId))) return;
    await this.presence.heartbeat(payload.householdId, userId);
  }
}
