import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { PresenceUpdateEvent, ServerEvents } from '@household/contracts';
import { PresenceService } from '../../presence/presence.service';
import { MessageHandler } from './message-handler.interface';

export interface LeaveRoomPayload {
  roomName: string;
}

@Injectable()
export class LeaveRoomHandler implements MessageHandler<LeaveRoomPayload> {
  constructor(private readonly presence: PresenceService) {}

  async handle(client: Socket, payload: LeaveRoomPayload): Promise<void> {
    await client.leave(payload.roomName);

    if (!payload.roomName.startsWith('household:')) return;

    const householdId = payload.roomName.replace('household:', '');
    const userId = client.data.userId as string;

    const isLastSocket = this.presence.leaveHousehold(userId, householdId, client.id);
    (client.data.householdIds as Set<string>).delete(householdId);

    if (isLastSocket) {
      await this.presence.setOffline(householdId, userId);
      const event: PresenceUpdateEvent = {
        userId,
        status: 'offline',
        displayName: (client.data.displayName as string | undefined) ?? userId,
      };
      // client.nsp.server is the same io Server that @WebSocketServer() injects.
      // Using it here keeps handlers independent of the gateway instance.
      client.nsp.server.to(payload.roomName).emit(ServerEvents.PRESENCE_UPDATE, event);
    }
  }
}
