import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { maskId } from '@household/common';
import { PresenceUpdateEvent, ServerEvents } from '@household/contracts';
import { MembershipService } from '../../membership/membership.service';
import { PresenceService } from '../../presence/presence.service';
import { MessageHandler } from './message-handler.interface';

export interface JoinRoomPayload {
  roomName: string;
  displayName?: string;
}

@Injectable()
export class JoinRoomHandler implements MessageHandler<JoinRoomPayload> {
  private readonly logger = new Logger(JoinRoomHandler.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly membership: MembershipService,
  ) {}

  async handle(client: Socket, payload: JoinRoomPayload): Promise<void> {
    const userId = client.data.userId as string;

    if (payload.roomName.startsWith('household:')) {
      const householdId = payload.roomName.replace('household:', '');
      if (!(await this.membership.isMember(userId, householdId))) {
        this.logger.warn(
          `User ${maskId(userId)} denied join for household ${maskId(householdId)}`,
        );
        client.emit('error', { message: 'Not a member of this household' });
        return;
      }
    }

    await client.join(payload.roomName);

    if (!payload.roomName.startsWith('household:')) return;

    const householdId = payload.roomName.replace('household:', '');

    if (payload.displayName) {
      client.data.displayName = payload.displayName;
    }

    const isFirstSocket = this.presence.joinHousehold(userId, householdId, client.id);
    (client.data.householdIds as Set<string>).add(householdId);

    if (isFirstSocket) {
      await this.presence.setOnline(householdId, {
        userId,
        displayName: (client.data.displayName as string | undefined) ?? userId,
      });
    }

    const users = await this.presence.getSnapshot(householdId);
    client.emit(ServerEvents.PRESENCE_SNAPSHOT, { users });

    if (isFirstSocket) {
      const event: PresenceUpdateEvent = {
        userId,
        status: 'online',
        displayName: (client.data.displayName as string | undefined) ?? userId,
      };
      client.to(payload.roomName).emit(ServerEvents.PRESENCE_UPDATE, event);
    }
  }
}
