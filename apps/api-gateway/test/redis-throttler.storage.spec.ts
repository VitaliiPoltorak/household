import { RedisThrottlerStorage } from '../src/throttler/redis-throttler.storage';

// Mock ioredis instance
const mockRedis = {
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
};

describe('RedisThrottlerStorage (unit)', () => {
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new RedisThrottlerStorage(mockRedis as never);
  });

  const KEY = 'test-ip';
  const TTL = 60;
  const LIMIT = 5;
  const BLOCK_DURATION = 120;

  describe('normal requests (under limit)', () => {
    it('returns hit count and not blocked on first request', async () => {
      mockRedis.get.mockResolvedValue(null);       // not blocked
      mockRedis.incr.mockResolvedValue(1);          // first hit
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(59);

      const result = await storage.increment(KEY, TTL, LIMIT, BLOCK_DURATION);

      expect(result.totalHits).toBe(1);
      expect(result.isBlocked).toBe(false);
      expect(result.timeToExpire).toBe(59);
      expect(mockRedis.expire).toHaveBeenCalledWith(`throttler:count:${KEY}`, TTL);
    });

    it('does not reset TTL after first hit', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(3);          // third hit, not first
      mockRedis.ttl.mockResolvedValue(45);

      await storage.increment(KEY, TTL, LIMIT, BLOCK_DURATION);

      expect(mockRedis.expire).not.toHaveBeenCalled(); // TTL already set on first hit
    });

    it('returns increasing totalHits within limit', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(4);
      mockRedis.ttl.mockResolvedValue(30);

      const result = await storage.increment(KEY, TTL, LIMIT, BLOCK_DURATION);

      expect(result.totalHits).toBe(4);
      expect(result.isBlocked).toBe(false);
    });
  });

  describe('limit exceeded — blocking', () => {
    it('sets block key and deletes counter when limit exceeded', async () => {
      mockRedis.get.mockResolvedValue(null);        // not yet blocked
      mockRedis.incr.mockResolvedValue(LIMIT + 1); // over limit
      mockRedis.ttl.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      const result = await storage.increment(KEY, TTL, LIMIT, BLOCK_DURATION);

      expect(result.isBlocked).toBe(true);
      expect(result.timeToBlockExpire).toBe(BLOCK_DURATION);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `throttler:block:${KEY}`, BLOCK_DURATION, '1',
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`throttler:count:${KEY}`);
    });
  });

  describe('already blocked', () => {
    it('returns blocked state without incrementing counter', async () => {
      mockRedis.get.mockResolvedValue('1');         // blocked
      mockRedis.ttl.mockResolvedValue(90);

      const result = await storage.increment(KEY, TTL, LIMIT, BLOCK_DURATION);

      expect(result.isBlocked).toBe(true);
      expect(result.totalHits).toBe(LIMIT + 1);
      expect(result.timeToBlockExpire).toBe(90);
      expect(mockRedis.incr).not.toHaveBeenCalled();   // no counter increment while blocked
    });

    it('returns 0 timeToBlockExpire if Redis TTL is negative (expired key edge case)', async () => {
      mockRedis.get.mockResolvedValue('1');
      mockRedis.ttl.mockResolvedValue(-1);

      const result = await storage.increment(KEY, TTL, LIMIT, BLOCK_DURATION);

      expect(result.timeToBlockExpire).toBe(0);
    });
  });
});
