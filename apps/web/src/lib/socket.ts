import { io, type Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3010';

// Event name constants (mirrors @household/contracts ServerEvents / ClientEvents)
export const ServerEvents = {
  PRESENCE_SNAPSHOT: 'presence:snapshot',
  PRESENCE_UPDATE: 'presence:update',
  ENTITY_CREATED: 'entity:created',
  ENTITY_UPDATED: 'entity:updated',
  ENTITY_DELETED: 'entity:deleted',
} as const;

export const ClientEvents = {
  HEARTBEAT: 'presence:heartbeat',
  EDITING_START: 'editing:start',
  EDITING_STOP: 'editing:stop',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
} as const;

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  editingEntity?: string;
  editingId?: string;
}

export interface EntityEvent {
  entity: string;
  householdId: string;
  entityId?: string;
  data?: unknown;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, { autoConnect: false, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function connectSocket(token: string): Socket {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}
