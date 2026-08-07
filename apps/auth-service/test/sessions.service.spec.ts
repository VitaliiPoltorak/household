import { createHash } from 'crypto';
import { SessionsService, Session } from '../src/sessions/sessions.service';

// Minimal ioredis mock — only the calls SessionsService uses.
const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  getdel: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  quit: jest.fn(),
};

// Bypass the constructor's `new Redis()` by swapping the ioredis default
// export before importing the service.
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

const hash = (v: string) => createHash('sha256').update(v).digest('hex');

const REFRESH_TTL_DAYS = 30;
const REFRESH_TTL_SECONDS = REFRESH_TTL_DAYS * 86400;

const configStub = {
  get: (key: string, def?: unknown) => {
    if (key === 'JWT_REFRESH_EXPIRES_DAYS') return REFRESH_TTL_DAYS;
    return def;
  },
} as any;

function buildStoredSession(userId: string, refreshToken: string, expiresAt?: string): string {
  const session: Session = {
    userId,
    refreshTokenHash: hash(refreshToken),
    expiresAt: expiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
  };
  return JSON.stringify(session);
}

describe('SessionsService (unit)', () => {
  let service: SessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionsService(configStub);
  });

  describe('createSession', () => {
    it('writes both session and owner shadow with matching TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const sessionId = await service.createSession('user-1', 'refresh-abc', 'iOS');

      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `session-owner:${sessionId}`,
        'user-1',
        'EX',
        REFRESH_TTL_SECONDS,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `session:${sessionId}`,
        expect.stringContaining(hash('refresh-abc')),
        'EX',
        REFRESH_TTL_SECONDS,
      );
    });
  });

  describe('consumeSession — happy path', () => {
    it('uses GETDEL to atomically fetch+remove and drops the owner shadow', async () => {
      mockRedis.getdel.mockResolvedValue(buildStoredSession('user-1', 'refresh-abc'));
      mockRedis.del.mockResolvedValue(1);

      const result = await service.consumeSession('sess-1', 'refresh-abc');

      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.session.userId).toBe('user-1');
      expect(mockRedis.getdel).toHaveBeenCalledWith('session:sess-1');
      expect(mockRedis.del).toHaveBeenCalledWith('session-owner:sess-1');
    });
  });

  describe('consumeSession — reuse detection', () => {
    it('returns "reused" when session is gone but owner shadow remains', async () => {
      mockRedis.getdel.mockResolvedValue(null);
      mockRedis.get.mockResolvedValue('user-42');

      const result = await service.consumeSession('sess-1', 'refresh-abc');

      expect(result).toEqual({ status: 'reused', userId: 'user-42' });
      expect(mockRedis.get).toHaveBeenCalledWith('session-owner:sess-1');
    });

    it('returns "invalid" when both keys are gone (unknown session)', async () => {
      mockRedis.getdel.mockResolvedValue(null);
      mockRedis.get.mockResolvedValue(null);

      const result = await service.consumeSession('sess-1', 'refresh-abc');

      expect(result).toEqual({ status: 'invalid' });
    });
  });

  describe('consumeSession — validation errors', () => {
    it('returns "invalid" on hash mismatch', async () => {
      mockRedis.getdel.mockResolvedValue(buildStoredSession('user-1', 'refresh-abc'));

      const result = await service.consumeSession('sess-1', 'wrong-token');

      expect(result).toEqual({ status: 'invalid' });
      // Owner shadow is NOT dropped on hash mismatch — could still be a reuse
      // signal if the legitimate holder tries again.
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('returns "invalid" when the stored session is past its expiry', async () => {
      mockRedis.getdel.mockResolvedValue(
        buildStoredSession('user-1', 'refresh-abc', new Date(Date.now() - 1000).toISOString()),
      );

      const result = await service.consumeSession('sess-1', 'refresh-abc');

      expect(result).toEqual({ status: 'invalid' });
    });
  });

  describe('TOCTOU: no double-consume', () => {
    it('second call sees GETDEL null and reports reused (shadow still there)', async () => {
      mockRedis.getdel
        .mockResolvedValueOnce(buildStoredSession('user-1', 'refresh-abc')) // first call succeeds
        .mockResolvedValueOnce(null);                                        // second call: gone
      mockRedis.get.mockResolvedValue('user-1');                             // shadow still present
      mockRedis.del.mockResolvedValue(1);

      const first = await service.consumeSession('sess-1', 'refresh-abc');
      const second = await service.consumeSession('sess-1', 'refresh-abc');

      expect(first.status).toBe('ok');
      expect(second).toEqual({ status: 'reused', userId: 'user-1' });
    });
  });

  describe('deleteSession', () => {
    it('deletes both session and owner shadow', async () => {
      await service.deleteSession('sess-1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:sess-1', 'session-owner:sess-1');
    });
  });

  describe('deleteAllUserSessions', () => {
    it('drops both keys for every session owned by the user', async () => {
      mockRedis.keys.mockResolvedValue(['session:a', 'session:b', 'session:c']);
      mockRedis.get
        .mockResolvedValueOnce(buildStoredSession('user-1', 't1'))
        .mockResolvedValueOnce(buildStoredSession('user-2', 't2'))
        .mockResolvedValueOnce(buildStoredSession('user-1', 't3'));

      await service.deleteAllUserSessions('user-1');

      expect(mockRedis.del).toHaveBeenCalledWith('session:a', 'session-owner:a');
      expect(mockRedis.del).toHaveBeenCalledWith('session:c', 'session-owner:c');
      expect(mockRedis.del).not.toHaveBeenCalledWith('session:b', expect.anything());
    });
  });
});
