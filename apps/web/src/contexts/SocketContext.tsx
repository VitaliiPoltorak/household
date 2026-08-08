import {
  createContext, useContext, useEffect, useRef, useState,
  useCallback, ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  connectSocket, disconnectSocket,
  ServerEvents, ClientEvents,
  type PresenceUser, type EntityEvent,
} from '../lib/socket';
import { useAuth } from './AuthContext';
import { useHousehold } from './HouseholdContext';
import { getAccessToken } from '../api/client';

// Map entity type → TanStack query keys to invalidate
const ENTITY_KEYS: Record<string, string[]> = {
  transaction:  ['transactions'],
  account:      ['accounts'],
  shoppingList: ['shopping-lists'],
  shoppingItem: ['shopping-list'],
  member:       ['members'],
  household:    ['households'],
};

interface SocketContextValue {
  isConnected: boolean;
  onlineUsers: PresenceUser[];
  emitEditingStart: (entity: string, entityId: string) => void;
  emitEditingStop: (entity: string, entityId: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeHousehold } = useHousehold();
  const qc = useQueryClient();

  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const activeRoomRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Connect / disconnect based on auth state. Access token lives in the
  // api/client module after #60; we snapshot it here — a fresh token from
  // refresh will trigger a re-render via `user` change so we reconnect.
  useEffect(() => {
    const accessToken = getAccessToken();
    if (!user || !accessToken) {
      disconnectSocket();
      setIsConnected(false);
      setOnlineUsers([]);
      return;
    }

    const s = connectSocket(accessToken);
    socketRef.current = s;

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => { setIsConnected(false); setOnlineUsers([]); });

    // Entity live updates → invalidate relevant queries
    const handleEntityEvent = (data: EntityEvent) => {
      const keys = ENTITY_KEYS[data.entity];
      if (!keys) return;
      keys.forEach((key) => {
        qc.invalidateQueries({ queryKey: [key, data.householdId] });
        // Also invalidate specific list detail
        if (data.entity === 'shoppingItem' && data.entityId) {
          qc.invalidateQueries({ queryKey: ['shopping-list', data.entityId, data.householdId] });
        }
      });
    };

    s.on(ServerEvents.ENTITY_CREATED, handleEntityEvent);
    s.on(ServerEvents.ENTITY_UPDATED, handleEntityEvent);
    s.on(ServerEvents.ENTITY_DELETED, handleEntityEvent);

    // Presence
    s.on(ServerEvents.PRESENCE_SNAPSHOT, ({ users }: { users: PresenceUser[] }) => {
      setOnlineUsers(users);
    });

    s.on(ServerEvents.PRESENCE_UPDATE, (update: PresenceUser & { status: 'online' | 'offline' }) => {
      setOnlineUsers((prev) => {
        if (update.status === 'offline') return prev.filter((u) => u.userId !== update.userId);
        const exists = prev.find((u) => u.userId === update.userId);
        if (exists) return prev.map((u) => (u.userId === update.userId ? { ...u, ...update } : u));
        return [...prev, update];
      });
    });

    return () => {
      s.off('connect');
      s.off('disconnect');
      s.off(ServerEvents.ENTITY_CREATED, handleEntityEvent);
      s.off(ServerEvents.ENTITY_UPDATED, handleEntityEvent);
      s.off(ServerEvents.ENTITY_DELETED, handleEntityEvent);
      s.off(ServerEvents.PRESENCE_SNAPSHOT);
      s.off(ServerEvents.PRESENCE_UPDATE);
    };
  }, [user, qc]);

  // Join / leave household room
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !isConnected) return;

    // Leave previous room
    if (activeRoomRef.current) {
      s.emit(ClientEvents.ROOM_LEAVE, { roomName: activeRoomRef.current });
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    }

    if (!activeHousehold) { activeRoomRef.current = null; return; }

    const room = `household:${activeHousehold.id}`;
    activeRoomRef.current = room;
    s.emit(ClientEvents.ROOM_JOIN, { roomName: room, displayName: user?.displayName });

    // Heartbeat every 30s to keep presence alive
    heartbeatRef.current = setInterval(() => {
      s.emit(ClientEvents.HEARTBEAT, { householdId: activeHousehold.id });
    }, 30_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [isConnected, activeHousehold, user?.displayName]);

  const emitEditingStart = useCallback((entity: string, entityId: string) => {
    if (!socketRef.current || !activeHousehold) return;
    socketRef.current.emit(ClientEvents.EDITING_START, {
      householdId: activeHousehold.id,
      entity,
      entityId,
    });
  }, [activeHousehold]);

  const emitEditingStop = useCallback((entity: string, entityId: string) => {
    if (!socketRef.current || !activeHousehold) return;
    socketRef.current.emit(ClientEvents.EDITING_STOP, {
      householdId: activeHousehold.id,
      entity,
      entityId,
    });
  }, [activeHousehold]);

  return (
    <SocketContext.Provider value={{ isConnected, onlineUsers, emitEditingStart, emitEditingStop }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}

// Returns the user currently editing a specific entity (if any)
export function useEditingUser(entity: string, entityId: string): PresenceUser | null {
  const { onlineUsers } = useSocket();
  return onlineUsers.find(
    (u) => u.editingEntity === entity && u.editingId === entityId,
  ) ?? null;
}
