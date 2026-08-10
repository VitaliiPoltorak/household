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
export class EditingStartHandler implements MessageHandler<EditingPayload> {
  constructor(
    private readonly presence: PresenceService,
    private readonly membership: MembershipService,
  ) {}

  async handle(client: Socket, payload: EditingPayload): Promise<void> {
    const userId = client.data.userId as string;
    if (!(await this.membership.isMember(userId, payload.householdId))) return;

    await this.presence.setEditing(
      payload.householdId,
      userId,
      payload.entity,
      payload.entityId,
    );

    const event: PresenceUpdateEvent = {
      userId,
      status: 'online',
      displayName: (client.data.displayName as string | undefined) ?? userId,
      editingEntity: payload.entity,
      editingId: payload.entityId,
    };
    client.nsp.server
      .to(`household:${payload.householdId}`)
      .emit(ServerEvents.PRESENCE_UPDATE, event);
  }
}
