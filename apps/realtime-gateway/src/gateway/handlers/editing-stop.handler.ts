import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import {
  EditingPayload,
  PresenceUpdateEvent,
  ServerEvents,
} from '@household/contracts';
import { MembershipService } from '../../membership/membership.service';
import { PresenceService } from '../../presence/presence.service';
import { MessageHandler } from './message-handler.interface';

@Injectable()
export class EditingStopHandler implements MessageHandler<EditingPayload> {
  constructor(
    private readonly presence: PresenceService,
    private readonly membership: MembershipService,
  ) {}

  async handle(client: Socket, payload: EditingPayload): Promise<void> {
    const userId = client.data.userId as string;
    if (!(await this.membership.isMember(userId, payload.householdId))) return;

    await this.presence.clearEditing(payload.householdId, userId);

    const event: PresenceUpdateEvent = {
      userId,
      status: 'online',
      displayName: (client.data.displayName as string | undefined) ?? userId,
    };
    client.nsp.server
      .to(`household:${payload.householdId}`)
      .emit(ServerEvents.PRESENCE_UPDATE, event);
  }
}
