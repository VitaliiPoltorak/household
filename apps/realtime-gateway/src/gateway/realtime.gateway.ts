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
import { maskId } from '@household/common';
import { PresenceService } from '../presence/presence.service';
import {
  ClientEvents,
  ServerEvents,
  EditingPayload,
  PresenceUpdateEvent,
} from '@household/contracts';
import {
  JoinRoomHandler,
  JoinRoomPayload,
} from './handlers/join-room.handler';
import {
  LeaveRoomHandler,
  LeaveRoomPayload,
} from './handlers/leave-room.handler';
import {
  HeartbeatHandler,
  HeartbeatPayload,
} from './handlers/heartbeat.handler';
import { EditingStartHandler } from './handlers/editing-start.handler';
import { EditingStopHandler } from './handlers/editing-stop.handler';

/**
 * Thin dispatcher (#93). Per-message behaviour lives in handler classes under
 * ./handlers/*. Connection/disconnection lifecycle stays here — it's not a
 * @SubscribeMessage event, and disconnect touches state (household set) that
 * this class owns.
 */
@WebSocketGateway({ transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly joinRoom: JoinRoomHandler,
    private readonly leaveRoom: LeaveRoomHandler,
    private readonly heartbeat: HeartbeatHandler,
    private readonly editingStart: EditingStartHandler,
    private readonly editingStop: EditingStopHandler,
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
    this.logger.debug(`Connected: user=${maskId(userId)} sock=${maskId(client.id)}`);
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
      `Disconnected: user=${maskId(userId)} sock=${maskId(client.id)}` +
        (offlineInHouseholds.length ? ` — offline in ${offlineInHouseholds.length} household(s)` : ''),
    );
  }

  @SubscribeMessage(ClientEvents.ROOM_JOIN)
  handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    return this.joinRoom.handle(client, payload);
  }

  @SubscribeMessage(ClientEvents.ROOM_LEAVE)
  handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ): Promise<void> {
    return this.leaveRoom.handle(client, payload);
  }

  @SubscribeMessage(ClientEvents.HEARTBEAT)
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: HeartbeatPayload,
  ): Promise<void> {
    return this.heartbeat.handle(client, payload);
  }

  @SubscribeMessage(ClientEvents.EDITING_START)
  handleEditingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditingPayload,
  ): Promise<void> {
    return this.editingStart.handle(client, payload);
  }

  @SubscribeMessage(ClientEvents.EDITING_STOP)
  handleEditingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditingPayload,
  ): Promise<void> {
    return this.editingStop.handle(client, payload);
  }
}
