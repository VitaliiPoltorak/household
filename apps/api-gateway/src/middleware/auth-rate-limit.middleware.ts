import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

interface Rule {
  method: string;
  pathPrefix: string;
  limit: number;
  windowSeconds: number;
}

// Per-endpoint limits for unauthenticated auth routes. Global throttler is
// too lenient (100/min) for these — they are entry points for OAuth abuse
// and refresh-token brute-force.
const AUTH_RULES: Rule[] = [
  { method: 'POST', pathPrefix: '/api/v1/auth/refresh', limit: 5, windowSeconds: 60 },
  { method: 'POST', pathPrefix: '/api/v1/auth/google', limit: 10, windowSeconds: 3600 },
  { method: 'POST', pathPrefix: '/api/v1/auth/apple', limit: 10, windowSeconds: 3600 },
  { method: 'POST', pathPrefix: '/api/v1/auth/facebook', limit: 10, windowSeconds: 3600 },
  // Manual email/password (auth-service adds a per-email throttler on top of
  // this per-IP one — see apps/auth-service/src/auth/email-throttler.service.ts).
  // /verify-email/resend matches the /verify-email prefix intentionally: both
  // deserve the same aggressive per-IP ceiling.
  { method: 'POST', pathPrefix: '/api/v1/auth/register', limit: 20, windowSeconds: 3600 },
  { method: 'POST', pathPrefix: '/api/v1/auth/verify-email', limit: 30, windowSeconds: 900 },
  { method: 'POST', pathPrefix: '/api/v1/auth/login', limit: 30, windowSeconds: 900 },
  { method: 'POST', pathPrefix: '/api/v1/auth/unlock', limit: 10, windowSeconds: 3600 },
];

const logger = new Logger('AuthRateLimit');

function extractIp(req: Request): string {
  return (req.ips && req.ips.length ? req.ips[0] : req.ip) || 'unknown';
}

export function createAuthRateLimitMiddleware(redis: Redis) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rule = AUTH_RULES.find(
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
      logger.error(`Rate limit check failed for ${key}: ${(err as Error).message}`);
      return next();
    }
  };
}

export const AUTH_RATE_LIMIT_RULES = AUTH_RULES;
