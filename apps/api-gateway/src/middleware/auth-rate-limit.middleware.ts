import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

interface Rule {
  method: string;
  pathPrefix: string;
  limit: number;
  windowSeconds: number;
}

// Overrides only exist for /auth/refresh — see buildAuthRules below for why.
export interface AuthRateLimitOverrides {
  refreshLimit?: number;
  refreshWindowSeconds?: number;
}

// Per-endpoint limits for unauthenticated auth routes. Global throttler is
// too lenient (100/min) for these — they are entry points for OAuth abuse
// and refresh-token brute-force.
//
// /auth/refresh's limit is overridable (AUTH_REFRESH_RATE_LIMIT /
// AUTH_REFRESH_RATE_WINDOW_SECONDS, wired in main.ts) because it's called
// once per page load — unlike the other rules here, which only fire on
// deliberate user actions (login, register, OAuth). Behind Docker's default
// bridge networking, every request from the host machine arrives at this
// container with the SAME source IP (the bridge gateway) regardless of
// which browser tab or how many separate reloads sent it — so in a local
// dev environment this rule is effectively "N requests per whole machine",
// not per real client, and 5/60s is trivially exhausted by ordinary
// multi-tab development (#249). Production is unaffected: a real deploy
// behind a reverse proxy sees each client's real IP, so leave the default
// (5/60s) as the strict, correct value there — only .env/.env.ci raise it.
function buildAuthRules(overrides: AuthRateLimitOverrides = {}): Rule[] {
  return [
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/refresh',
      limit: overrides.refreshLimit ?? 5,
      windowSeconds: overrides.refreshWindowSeconds ?? 60,
    },
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/google',
      limit: 10,
      windowSeconds: 3600,
    },
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/apple',
      limit: 10,
      windowSeconds: 3600,
    },
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/facebook',
      limit: 10,
      windowSeconds: 3600,
    },
    // Manual email/password (auth-service adds a per-email throttler on top of
    // this per-IP one — see apps/auth-service/src/auth/email-throttler.service.ts).
    // /verify-email/resend matches the /verify-email prefix intentionally: both
    // deserve the same aggressive per-IP ceiling.
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/register',
      limit: 20,
      windowSeconds: 3600,
    },
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/verify-email',
      limit: 30,
      windowSeconds: 900,
    },
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/login',
      limit: 30,
      windowSeconds: 900,
    },
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/unlock',
      limit: 10,
      windowSeconds: 3600,
    },
    // Authenticated route, but still worth a per-IP ceiling — a compromised
    // session should not be able to burn through password-change attempts.
    {
      method: 'POST',
      pathPrefix: '/api/v1/auth/password/change',
      limit: 10,
      windowSeconds: 3600,
    },
  ];
}

const logger = new Logger('AuthRateLimit');

function extractIp(req: Request): string {
  return (req.ips && req.ips.length ? req.ips[0] : req.ip) || 'unknown';
}

export function createAuthRateLimitMiddleware(
  redis: Redis,
  overrides: AuthRateLimitOverrides = {},
) {
  const rules = buildAuthRules(overrides);
  return async (req: Request, res: Response, next: NextFunction) => {
    const rule = rules.find(
      (r) => req.method === r.method && req.path.startsWith(r.pathPrefix),
    );
    if (!rule) return next();

    const ip = extractIp(req);
    const key = `auth-rl:${rule.pathPrefix}:${ip}`;

    try {
      const hits = await redis.incr(key);
      if (hits === 1) {
        await redis.expire(key, rule.windowSeconds);
      }
      if (hits > rule.limit) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : rule.windowSeconds;
        res.setHeader('Retry-After', String(retryAfter));
        logger.warn(
          `Rate limit exceeded: ${rule.pathPrefix} from ${ip} (${hits}/${rule.limit})`,
        );
        return res.status(429).json({
          statusCode: 429,
          message: 'Too many requests. Try again later.',
          error: 'Too Many Requests',
          timestamp: new Date().toISOString(),
          path: req.url,
        });
      }
      return next();
    } catch (err) {
      // Fail-open on Redis errors: locking every user out of auth if the
      // rate-limit store hiccups is a worse outcome than losing the check.
      logger.error(
        `Rate limit check failed for ${key}: ${(err as Error).message}`,
      );
      return next();
    }
  };
}

export const AUTH_RATE_LIMIT_RULES = buildAuthRules();
