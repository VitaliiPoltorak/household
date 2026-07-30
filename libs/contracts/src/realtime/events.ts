export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  editingEntity?: string;
  editingId?: string;
}

export interface EntityEvent<T = unknown> {
  entity: string;
  householdId: string;
  entityId?: string;
  data?: T;
}

export interface PresenceUpdateEvent {
  userId: string;
  status: 'online' | 'offline';
  displayName: string;
  avatarUrl?: string;
  editingEntity?: string;
  editingId?: string;
}

export interface EditingPayload {
  householdId: string;
  entity: string;
  entityId: string;
}

// Client → Server event names
export const ClientEvents = {
  HEARTBEAT: 'presence:heartbeat',
  EDITING_START: 'editing:start',
  EDITING_STOP: 'editing:stop',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
} as const;

// Server → Client event names
export const ServerEvents = {
  PRESENCE_SNAPSHOT: 'presence:snapshot',
  PRESENCE_UPDATE: 'presence:update',
  ENTITY_CREATED: 'entity:created',
  ENTITY_UPDATED: 'entity:updated',
  ENTITY_DELETED: 'entity:deleted',
} as const;
