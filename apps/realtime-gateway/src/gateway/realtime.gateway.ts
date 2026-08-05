import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PresenceService } from '../presence/presence.service';
import { MembershipService } from '../membership/membership.service';
import {
  ClientEvents,
  ServerEvents,
  EditingPayload,
  PresenceUpdateEvent,
} from '@household/contracts';

@WebSocketGateway({ transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly membership: MembershipService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
      return;
    }
    // Store household IDs joined by this socket for reliable disconnect cleanup
    client.data.householdIds = new Set<string>();
    this.logger.debug(`Connected: ${userId} (${client.id})`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    // disconnectSocket returns households where user has no more sockets
    const offlineInHouseholds = this.presence.disconnectSocket(userId, client.id);

    for (const householdId of offlineInHouseholds) {
      await this.presence.setOffline(householdId, userId);
      const event: PresenceUpdateEvent = {
        userId,
        status: 'offline',
        displayName: (client.data.displayName as string | undefined) ?? userId,
      };
      this.server.to(`household:${householdId}`).emit(ServerEvents.PRESENCE_UPDATE, event);
    }

    this.logger.debug(
      `Disconnected: ${userId} (${client.id})` +
        (offlineInHouseholds.length ? ` — offline in: ${offlineInHouseholds.join(', ')}` : ''),
    );
  }

  @SubscribeMessage(ClientEvents.ROOM_JOIN)
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomName: string; displayName?: string },
  ): Promise<void> {
    const userId = client.data.userId as string;

    if (payload.roomName.startsWith('household:')) {
      const householdId = payload.roomName.replace('household:', '');
      if (!(await this.membership.isMember(userId, householdId))) {
        this.logger.warn(`User ${userId} denied join for household ${householdId}`);
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
      // First device joining this household — register in Redis
      await this.presence.setOnline(householdId, {
        userId,
        displayName: (client.data.displayName as string | undefined) ?? userId,
      });
    }

    // Send current snapshot to the joining socket
    const users = await this.presence.getSnapshot(householdId);
    client.emit(ServerEvents.PRESENCE_SNAPSHOT, { users });

    // Broadcast to others only when user appears for the first time in this household
    if (isFirstSocket) {
      const event: PresenceUpdateEvent = {
        userId,
        status: 'online',
        displayName: (client.data.displayName as string | undefined) ?? userId,
      };
      client.to(payload.roomName).emit(ServerEvents.PRESENCE_UPDATE, event);
    }
  }

  @SubscribeMessage(ClientEvents.ROOM_LEAVE)
  async handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomName: string },
  ): Promise<void> {
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
      this.server.to(payload.roomName).emit(ServerEvents.PRESENCE_UPDATE, event);
    }
  }

  @SubscribeMessage(ClientEvents.HEARTBEAT)
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { householdId: string },
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!(await this.membership.isMember(userId, payload.householdId))) return;
    await this.presence.heartbeat(payload.householdId, userId);
  }

  @SubscribeMessage(ClientEvents.EDITING_START)
  async handleEditingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditingPayload,
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!(await this.membership.isMember(userId, payload.householdId))) return;

    await this.presence.setEditing(payload.householdId, userId, payload.entity, payload.entityId);

    const event: PresenceUpdateEvent = {
      userId,
      status: 'online',
      displayName: (client.data.displayName as string | undefined) ?? userId,
      editingEntity: payload.entity,
      editingId: payload.entityId,
    };
    this.server.to(`household:${payload.householdId}`).emit(ServerEvents.PRESENCE_UPDATE, event);
  }

  @SubscribeMessage(ClientEvents.EDITING_STOP)
  async handleEditingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditingPayload,
  ): Promise<void> {
    const userId = client.data.userId as string;
    if (!(await this.membership.isMember(userId, payload.householdId))) return;

    await this.presence.clearEditing(payload.householdId, userId);

    const event: PresenceUpdateEvent = {
      userId,
      status: 'online',
      displayName: (client.data.displayName as string | undefined) ?? userId,
    };
    this.server.to(`household:${payload.householdId}`).emit(ServerEvents.PRESENCE_UPDATE, event);
  }
}
