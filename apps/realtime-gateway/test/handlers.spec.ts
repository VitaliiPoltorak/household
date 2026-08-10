import { ServerEvents } from '@household/contracts';
import { JoinRoomHandler } from '../src/gateway/handlers/join-room.handler';
import { LeaveRoomHandler } from '../src/gateway/handlers/leave-room.handler';
import { HeartbeatHandler } from '../src/gateway/handlers/heartbeat.handler';
import { EditingStartHandler } from '../src/gateway/handlers/editing-start.handler';
import { EditingStopHandler } from '../src/gateway/handlers/editing-stop.handler';

type PresenceMock = {
  joinHousehold: jest.Mock;
  leaveHousehold: jest.Mock;
  setOnline: jest.Mock;
  setOffline: jest.Mock;
  heartbeat: jest.Mock;
  setEditing: jest.Mock;
  clearEditing: jest.Mock;
  getSnapshot: jest.Mock;
};

type MembershipMock = { isMember: jest.Mock };

/**
 * The Socket mock exposes only the surface the handlers touch. `client.to(...)`
 * and `client.nsp.server.to(...)` both return an emitter-shaped stub so we can
 * assert the specific event that was broadcast to the right room.
 */
function makeSocket(userId = 'u1', socketId = 'sock1') {
  const roomEmit = jest.fn();
  const serverRoomEmit = jest.fn();
  const clientToRoom = jest.fn(() => ({ emit: roomEmit }));
  const serverToRoom = jest.fn(() => ({ emit: serverRoomEmit }));

  const socket = {
    id: socketId,
    data: {
      userId,
      householdIds: new Set<string>(),
      displayName: undefined as string | undefined,
    },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    to: clientToRoom,
    nsp: { server: { to: serverToRoom } },
  } as any;

  return { socket, roomEmit, serverRoomEmit, clientToRoom, serverToRoom };
}

function makePresence(): PresenceMock {
  return {
    joinHousehold: jest.fn().mockReturnValue(true),
    leaveHousehold: jest.fn().mockReturnValue(true),
    setOnline: jest.fn().mockResolvedValue(undefined),
    setOffline: jest.fn().mockResolvedValue(undefined),
    heartbeat: jest.fn().mockResolvedValue(undefined),
    setEditing: jest.fn().mockResolvedValue(undefined),
    clearEditing: jest.fn().mockResolvedValue(undefined),
    getSnapshot: jest.fn().mockResolvedValue([]),
  };
}

function makeMembership(isMember = true): MembershipMock {
  return { isMember: jest.fn().mockResolvedValue(isMember) };
}

describe('JoinRoomHandler', () => {
  it('rejects household join when caller is not a member', async () => {
    const presence = makePresence();
    const membership = makeMembership(false);
    const handler = new JoinRoomHandler(presence as any, membership as any);
    const { socket } = makeSocket();

    await handler.handle(socket, { roomName: 'household:h1' });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: 'Not a member of this household',
    });
    expect(presence.joinHousehold).not.toHaveBeenCalled();
  });

  it('joins a household room, snapshots presence, broadcasts online on FIRST socket', async () => {
    const presence = makePresence();
    presence.joinHousehold.mockReturnValue(true); // first socket
    presence.getSnapshot.mockResolvedValue([{ userId: 'u1', displayName: 'Vitaliy' }]);
    const membership = makeMembership(true);
    const handler = new JoinRoomHandler(presence as any, membership as any);
    const { socket, clientToRoom, roomEmit } = makeSocket();

    await handler.handle(socket, { roomName: 'household:h1', displayName: 'Vitaliy' });

    expect(socket.join).toHaveBeenCalledWith('household:h1');
    expect(presence.setOnline).toHaveBeenCalledWith('h1', {
      userId: 'u1',
      displayName: 'Vitaliy',
    });
    expect(socket.emit).toHaveBeenCalledWith(ServerEvents.PRESENCE_SNAPSHOT, {
      users: [{ userId: 'u1', displayName: 'Vitaliy' }],
    });
    expect(clientToRoom).toHaveBeenCalledWith('household:h1');
    expect(roomEmit).toHaveBeenCalledWith(
      ServerEvents.PRESENCE_UPDATE,
      expect.objectContaining({ userId: 'u1', status: 'online', displayName: 'Vitaliy' }),
    );
    expect((socket.data.householdIds as Set<string>).has('h1')).toBe(true);
  });

  it('does NOT broadcast presence-update for a SECOND socket (same user, same household)', async () => {
    const presence = makePresence();
    presence.joinHousehold.mockReturnValue(false); // not first socket
    const membership = makeMembership(true);
    const handler = new JoinRoomHandler(presence as any, membership as any);
    const { socket, roomEmit } = makeSocket();

    await handler.handle(socket, { roomName: 'household:h1' });

    expect(presence.setOnline).not.toHaveBeenCalled();
    // Snapshot still goes to joining socket so the second device has state.
    expect(socket.emit).toHaveBeenCalledWith(ServerEvents.PRESENCE_SNAPSHOT, { users: [] });
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('joins a non-household room without touching presence or membership check', async () => {
    const presence = makePresence();
    const membership = makeMembership(true);
    const handler = new JoinRoomHandler(presence as any, membership as any);
    const { socket, roomEmit } = makeSocket();

    await handler.handle(socket, { roomName: 'lobby' });

    expect(membership.isMember).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('lobby');
    expect(presence.joinHousehold).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });
});

describe('LeaveRoomHandler', () => {
  it('broadcasts offline when this is the LAST socket for the user in that household', async () => {
    const presence = makePresence();
    presence.leaveHousehold.mockReturnValue(true);
    const handler = new LeaveRoomHandler(presence as any);
    const { socket, serverToRoom, serverRoomEmit } = makeSocket();
    (socket.data.householdIds as Set<string>).add('h1');

    await handler.handle(socket, { roomName: 'household:h1' });

    expect(socket.leave).toHaveBeenCalledWith('household:h1');
    expect(presence.setOffline).toHaveBeenCalledWith('h1', 'u1');
    expect(serverToRoom).toHaveBeenCalledWith('household:h1');
    expect(serverRoomEmit).toHaveBeenCalledWith(
      ServerEvents.PRESENCE_UPDATE,
      expect.objectContaining({ userId: 'u1', status: 'offline' }),
    );
    expect((socket.data.householdIds as Set<string>).has('h1')).toBe(false);
  });

  it('does NOT broadcast when user still has other sockets in the household', async () => {
    const presence = makePresence();
    presence.leaveHousehold.mockReturnValue(false);
    const handler = new LeaveRoomHandler(presence as any);
    const { socket, serverRoomEmit } = makeSocket();

    await handler.handle(socket, { roomName: 'household:h1' });

    expect(presence.setOffline).not.toHaveBeenCalled();
    expect(serverRoomEmit).not.toHaveBeenCalled();
  });

  it('non-household room leave: no presence touch, no broadcast', async () => {
    const presence = makePresence();
    const handler = new LeaveRoomHandler(presence as any);
    const { socket, serverRoomEmit } = makeSocket();

    await handler.handle(socket, { roomName: 'lobby' });

    expect(socket.leave).toHaveBeenCalledWith('lobby');
    expect(presence.leaveHousehold).not.toHaveBeenCalled();
    expect(serverRoomEmit).not.toHaveBeenCalled();
  });
});

describe('HeartbeatHandler', () => {
  it('refreshes presence TTL when caller is a member', async () => {
    const presence = makePresence();
    const membership = makeMembership(true);
    const handler = new HeartbeatHandler(presence as any, membership as any);
    const { socket } = makeSocket();

    await handler.handle(socket, { householdId: 'h1' });

    expect(presence.heartbeat).toHaveBeenCalledWith('h1', 'u1');
  });

  it('silently drops heartbeats from non-members (defence-in-depth)', async () => {
    const presence = makePresence();
    const membership = makeMembership(false);
    const handler = new HeartbeatHandler(presence as any, membership as any);
    const { socket } = makeSocket();

    await handler.handle(socket, { householdId: 'h1' });

    expect(presence.heartbeat).not.toHaveBeenCalled();
  });
});

describe('EditingStartHandler', () => {
  it('sets editing state and broadcasts to the household room for members', async () => {
    const presence = makePresence();
    const membership = makeMembership(true);
    const handler = new EditingStartHandler(presence as any, membership as any);
    const { socket, serverToRoom, serverRoomEmit } = makeSocket();
    socket.data.displayName = 'Vitaliy';

    await handler.handle(socket, {
      householdId: 'h1',
      entity: 'transaction',
      entityId: 't1',
    });

    expect(presence.setEditing).toHaveBeenCalledWith('h1', 'u1', 'transaction', 't1');
    expect(serverToRoom).toHaveBeenCalledWith('household:h1');
    expect(serverRoomEmit).toHaveBeenCalledWith(
      ServerEvents.PRESENCE_UPDATE,
      expect.objectContaining({
        userId: 'u1',
        status: 'online',
        displayName: 'Vitaliy',
        editingEntity: 'transaction',
        editingId: 't1',
      }),
    );
  });

  it('no-op for non-members', async () => {
    const presence = makePresence();
    const membership = makeMembership(false);
    const handler = new EditingStartHandler(presence as any, membership as any);
    const { socket, serverRoomEmit } = makeSocket();

    await handler.handle(socket, {
      householdId: 'h1',
      entity: 'transaction',
      entityId: 't1',
    });

    expect(presence.setEditing).not.toHaveBeenCalled();
    expect(serverRoomEmit).not.toHaveBeenCalled();
  });
});

describe('EditingStopHandler', () => {
  it('clears editing state and broadcasts to household for members', async () => {
    const presence = makePresence();
    const membership = makeMembership(true);
    const handler = new EditingStopHandler(presence as any, membership as any);
    const { socket, serverToRoom, serverRoomEmit } = makeSocket();

    await handler.handle(socket, {
      householdId: 'h1',
      entity: 'transaction',
      entityId: 't1',
    });

    expect(presence.clearEditing).toHaveBeenCalledWith('h1', 'u1');
    expect(serverToRoom).toHaveBeenCalledWith('household:h1');
    expect(serverRoomEmit).toHaveBeenCalledWith(
      ServerEvents.PRESENCE_UPDATE,
      expect.objectContaining({ userId: 'u1', status: 'online' }),
    );
    // The stop-editing broadcast intentionally does NOT carry editingEntity/editingId
    // — clients infer "no longer editing" from their absence.
    expect(serverRoomEmit.mock.calls[0][1]).not.toHaveProperty('editingEntity');
    expect(serverRoomEmit.mock.calls[0][1]).not.toHaveProperty('editingId');
  });

  it('no-op for non-members', async () => {
    const presence = makePresence();
    const membership = makeMembership(false);
    const handler = new EditingStopHandler(presence as any, membership as any);
    const { socket, serverRoomEmit } = makeSocket();

    await handler.handle(socket, {
      householdId: 'h1',
      entity: 'transaction',
      entityId: 't1',
    });

    expect(presence.clearEditing).not.toHaveBeenCalled();
    expect(serverRoomEmit).not.toHaveBeenCalled();
  });
});
