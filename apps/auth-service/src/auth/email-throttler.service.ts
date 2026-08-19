import {
  Injectable,
  Logger,
  OnModuleDestroy,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface EmailThrottleRule {
  /** Human-readable action name, used as the Redis key namespace. */
  action: 'register' | 'login' | 'verify-email' | 'resend-verification' | 'password-change';
  /** Max allowed hits per email per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

// Per-endpoint defaults. api-gateway already handles per-IP throttling; this
// second dimension defends against a distributed attacker rotating IPs while
// pounding a single email. Kept intentionally aggressive on register/resend
// since those are the ones with side effects (mailbox spam).
const DEFAULT_RULES: Record<EmailThrottleRule['action'], Omit<EmailThrottleRule, 'action'>> = {
  register: { limit: 5, windowSec: 3600 },
  login: { limit: 10, windowSec: 900 },
  'verify-email': { limit: 10, windowSec: 900 },
  'resend-verification': { limit: 3, windowSec: 3600 },
  'password-change': { limit: 5, windowSec: 3600 },
};

/**
 * Per-email rate limiter for auth endpoints. Sits alongside the api-gateway's
 * per-IP limiter — an attacker who rotates IPs still hits this ceiling on any
 * single victim mailbox.
 *
 * INCR + EXPIRE-on-first-hit pattern (same shape as
 * apps/api-gateway/src/throttler/redis-throttler.storage.ts). Fails open on
 * Redis errors: locking every user out of registration if Redis hiccups is a
 * worse outcome than losing the check.
 */
@Injectable()
export class EmailThrottlerService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailThrottlerService.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Throws 429 if the caller has exceeded the per-email limit for this
   * action. Uses the email in lowercase as the throttle bucket so
   * "Alice@x.com" and "alice@x.com" share a bucket.
   */
  async consume(action: EmailThrottleRule['action'], email: string): Promise<void> {
    const rule = DEFAULT_RULES[action];
    const key = `email-rl:${action}:${email.toLowerCase()}`;

    try {
      const hits = await this.redis.incr(key);
      if (hits === 1) {
        await this.redis.expire(key, rule.windowSec);
      }
      if (hits > rule.limit) {
        const ttl = await this.redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : rule.windowSec;
        this.logger.warn(
          `Per-email rate limit exceeded: action=${action} email=${maskEmail(email)} hits=${hits}/${rule.limit}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Try again later.',
            error: 'Too Many Requests',
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `Rate limit check failed for ${key}: ${(err as Error).message}`,
      );
      // fail-open
    }
  }

  /** Test-only helper — resets the counter for an action + email pair. */
  async resetForTest(action: EmailThrottleRule['action'], email: string): Promise<void> {
    await this.redis.del(`email-rl:${action}:${email.toLowerCase()}`);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
