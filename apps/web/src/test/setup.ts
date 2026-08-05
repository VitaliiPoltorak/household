import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Initialize i18n with English so t() calls return real strings
import '../i18n';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock socket to avoid WebSocket connections in tests
vi.mock('../lib/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  ServerEvents: {
    PRESENCE_SNAPSHOT: 'presence:snapshot',
    PRESENCE_UPDATE: 'presence:update',
    ENTITY_CREATED: 'entity:created',
    ENTITY_UPDATED: 'entity:updated',
    ENTITY_DELETED: 'entity:deleted',
  },
  ClientEvents: {
    HEARTBEAT: 'presence:heartbeat',
    EDITING_START: 'editing:start',
    EDITING_STOP: 'editing:stop',
    ROOM_JOIN: 'room:join',
    ROOM_LEAVE: 'room:leave',
  },
}));

// Mock SocketContext entirely — no real WebSocket in tests
vi.mock('../contexts/SocketContext', () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
  useSocket: () => ({
    isConnected: false,
    onlineUsers: [],
    emitEditingStart: vi.fn(),
    emitEditingStop: vi.fn(),
  }),
  useEditingUser: () => null,
}));
