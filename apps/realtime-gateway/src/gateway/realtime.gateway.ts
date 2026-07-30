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

  constructor(private readonly presence: PresenceService) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) {
      client.disconnect();
      return;
    }

    this.presence.trackConnect(userId, client.id);
    this.logger.debug(`Connected: ${userId} (${client.id})`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data.userId as string;
    if (!userId) return;

    const isLastConnection = this.presence.trackDisconnect(userId, client.id);

    if (isLastConnection) {
      // Broadcast offline to all rooms this socket was in
      const rooms = Array.from(client.rooms).filter((r) => r.startsWith('household:'));
      for (const room of rooms) {
        const householdId = room.replace('household:', '');
        await this.presence.setOffline(householdId, userId);
        const event: PresenceUpdateEvent = {
          userId,
          status: 'offline',
          displayName: client.data.displayName ?? userId,
        };
        this.server.to(room).emit(ServerEvents.PRESENCE_UPDATE, event);
      }
    }

    this.logger.debug(`Disconnected: ${userId} (${client.id})`);
  }

  @SubscribeMessage(ClientEvents.ROOM_JOIN)
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomName: string; displayName?: string },
  ) {
    const userId = client.data.userId as string;
    await client.join(payload.roomName);

    if (payload.roomName.startsWith('household:')) {
      const householdId = payload.roomName.replace('household:', '');

      // Store display name for presence events
      if (payload.displayName) {
        client.data.displayName = payload.displayName;
      }

      // Register presence
      await this.presence.setOnline(householdId, {
        userId,
        displayName: (payload.displayName ?? client.data.displayName ?? userId) as string,
      });

      // Send snapshot to the joining client
      const users = await this.presence.getSnapshot(householdId);
      client.emit(ServerEvents.PRESENCE_SNAPSHOT, { users });

      // Broadcast join to others in the room
      const event: PresenceUpdateEvent = {
        userId,
        status: 'online',
        displayName: (client.data.displayName ?? userId) as string,
      };
      client.to(payload.roomName).emit(ServerEvents.PRESENCE_UPDATE, event);
    }
  }

  @SubscribeMessage(ClientEvents.ROOM_LEAVE)
  async handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomName: string },
  ) {
    await client.leave(payload.roomName);

    if (payload.roomName.startsWith('household:')) {
      const householdId = payload.roomName.replace('household:', '');
      const userId = client.data.userId as string;
      const isLastConnection = this.presence.trackDisconnect(userId, client.id);

      if (isLastConnection) {
        await this.presence.setOffline(householdId, userId);
        const event: PresenceUpdateEvent = {
          userId,
          status: 'offline',
          displayName: (client.data.displayName ?? userId) as string,
        };
        this.server.to(payload.roomName).emit(ServerEvents.PRESENCE_UPDATE, event);
      }
    }
  }

  @SubscribeMessage(ClientEvents.HEARTBEAT)
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { householdId: string },
  ) {
    const userId = client.data.userId as string;
    await this.presence.heartbeat(payload.householdId, userId);
  }

  @SubscribeMessage(ClientEvents.EDITING_START)
  async handleEditingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditingPayload,
  ) {
    const userId = client.data.userId as string;
    await this.presence.setEditing(payload.householdId, userId, payload.entity, payload.entityId);

    const event: PresenceUpdateEvent = {
      userId,
      status: 'online',
      displayName: (client.data.displayName ?? userId) as string,
      editingEntity: payload.entity,
      editingId: payload.entityId,
    };
    this.server
      .to(`household:${payload.householdId}`)
      .emit(ServerEvents.PRESENCE_UPDATE, event);
  }

  @SubscribeMessage(ClientEvents.EDITING_STOP)
  async handleEditingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditingPayload,
  ) {
    const userId = client.data.userId as string;
    await this.presence.clearEditing(payload.householdId, userId);

    const event: PresenceUpdateEvent = {
      userId,
      status: 'online',
      displayName: (client.data.displayName ?? userId) as string,
    };
    this.server
      .to(`household:${payload.householdId}`)
      .emit(ServerEvents.PRESENCE_UPDATE, event);
  }
}
