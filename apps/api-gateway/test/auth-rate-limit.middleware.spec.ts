import { createAuthRateLimitMiddleware } from '../src/middleware/auth-rate-limit.middleware';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
};

function mockReq(method: string, path: string, ip = '1.2.3.4') {
  return { method, path, url: path, ip, ips: [] } as any;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

describe('createAuthRateLimitMiddleware (unit)', () => {
  let middleware: ReturnType<typeof createAuthRateLimitMiddleware>;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = createAuthRateLimitMiddleware(mockRedis as never);
  });

  describe('non-matching routes', () => {
    it('skips /accounts (not an auth route)', async () => {
      const next = jest.fn();
      await middleware(mockReq('GET', '/api/v1/accounts'), mockRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('skips GET on an auth path (rules are POST-only)', async () => {
      const next = jest.fn();
      await middleware(mockReq('GET', '/api/v1/auth/refresh'), mockRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });
  });

  describe('/auth/refresh (5/60s)', () => {
    it('allows the first request and sets window TTL', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      const next = jest.fn();

      await middleware(
        mockReq('POST', '/api/v1/auth/refresh'),
        mockRes(),
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'auth-rl:/api/v1/auth/refresh:1.2.3.4',
        60,
      );
    });

    it('does not re-set TTL on subsequent requests', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const next = jest.fn();

      await middleware(
        mockReq('POST', '/api/v1/auth/refresh'),
        mockRes(),
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('returns 429 with Retry-After when limit exceeded', async () => {
      mockRedis.incr.mockResolvedValue(6); // limit is 5
      mockRedis.ttl.mockResolvedValue(42);
      const next = jest.fn();
      const res = mockRes();

      await middleware(mockReq('POST', '/api/v1/auth/refresh'), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          error: 'Too Many Requests',
        }),
      );
    });

    it('falls back to window size when TTL is negative', async () => {
      mockRedis.incr.mockResolvedValue(6);
      mockRedis.ttl.mockResolvedValue(-1);
      const res = mockRes();

      await middleware(mockReq('POST', '/api/v1/auth/refresh'), res, jest.fn());

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    });
  });

  describe('OAuth routes (10/1h)', () => {
    it.each(['google', 'apple', 'facebook'])(
      'applies 1h window to /auth/%s',
      async (provider) => {
        mockRedis.incr.mockResolvedValue(1);
        mockRedis.expire.mockResolvedValue(1);

        await middleware(
          mockReq('POST', `/api/v1/auth/${provider}`),
          mockRes(),
          jest.fn(),
        );

        expect(mockRedis.expire).toHaveBeenCalledWith(
          `auth-rl:/api/v1/auth/${provider}:1.2.3.4`,
          3600,
        );
      },
    );

    it('blocks /auth/google after 10 requests', async () => {
      mockRedis.incr.mockResolvedValue(11);
      mockRedis.ttl.mockResolvedValue(3200);
      const res = mockRes();

      await middleware(mockReq('POST', '/api/v1/auth/google'), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('per-IP isolation', () => {
    it('prefers X-Forwarded-For (req.ips) when populated', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      const req = mockReq('POST', '/api/v1/auth/refresh');
      req.ips = ['5.6.7.8', 'proxy'];

      await middleware(req, mockRes(), jest.fn());

      expect(mockRedis.incr).toHaveBeenCalledWith(
        'auth-rl:/api/v1/auth/refresh:5.6.7.8',
      );
    });
  });

  describe('Redis failure', () => {
    it('fail-open: passes through when Redis throws', async () => {
      mockRedis.incr.mockRejectedValue(new Error('ECONNREFUSED'));
      const next = jest.fn();
      const res = mockRes();

      await middleware(mockReq('POST', '/api/v1/auth/refresh'), res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('/auth/refresh overrides (#249)', () => {
    it('uses a raised limit and window when overrides are passed', async () => {
      const overriddenMiddleware = createAuthRateLimitMiddleware(
        mockRedis as never,
        {
          refreshLimit: 30,
          refreshWindowSeconds: 120,
        },
      );

      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      await overriddenMiddleware(
        mockReq('POST', '/api/v1/auth/refresh'),
        mockRes(),
        jest.fn(),
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'auth-rl:/api/v1/auth/refresh:1.2.3.4',
        120,
      );

      // 10 hits would have 429'd under the default 5-limit — must pass under 30.
      mockRedis.incr.mockResolvedValue(10);
      const next = jest.fn();
      const res = mockRes();
      await overriddenMiddleware(
        mockReq('POST', '/api/v1/auth/refresh'),
        res,
        next,
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('leaves every other rule at its default when only refresh is overridden', async () => {
      const overriddenMiddleware = createAuthRateLimitMiddleware(
        mockRedis as never,
        {
          refreshLimit: 30,
        },
      );

      mockRedis.incr.mockResolvedValue(11); // over the OAuth default of 10
      mockRedis.ttl.mockResolvedValue(3200);
      const res = mockRes();
      await overriddenMiddleware(
        mockReq('POST', '/api/v1/auth/google'),
        res,
        jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });
});
