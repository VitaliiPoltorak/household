import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';

const DEFAULT_MAX_FAILS = 5;
const DEFAULT_FAILS_WINDOW_SEC = 900; // 15 min
const DEFAULT_LOCK_TTL_SEC = 3600;    // 1 h
const DEFAULT_UNLOCK_TOKEN_TTL_SEC = 3600;

export type FailResult =
  | { status: 'counted'; failsSoFar: number }
  | { status: 'lockedNow'; unlockToken: string };

export type ConsumeUnlockResult =
  | { status: 'ok'; userId: string }
  | { status: 'invalid' };

/**
 * Per-account soft-lock after 5 failed password attempts inside 15 minutes.
 * Sits alongside the request-rate limiter (EmailThrottlerService, per-IP
 * limiter in api-gateway) — those cap request rate; this caps *successful
 * abuse* signal. Distributed credential-stuffing across a botnet can walk
 * around per-IP limits trivially but still trips this per-account counter.
 *
 * Once locked, ALL logins are refused (correct password too) until the
 * legitimate mailbox owner clicks the emailed unlock link. Refusing correct
 * passwords is deliberate: the whole point of the lock is to force an
 * out-of-band confirmation that the request is from the account owner.
 *
 * Unlock tokens are single-use, consumed atomically via GETDEL, TTL 1 h.
 */
@Injectable()
export class LoginAttemptTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(LoginAttemptTrackerService.name);
  private readonly redis: Redis;
  private readonly maxFails: number;
  private readonly failsWindowSec: number;
  private readonly lockTtlSec: number;
  private readonly unlockTokenTtlSec: number;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
    });
    this.maxFails = Number(
      config.get<string>('LOGIN_MAX_FAILS', String(DEFAULT_MAX_FAILS)),
    );
    this.failsWindowSec = Number(
      config.get<string>('LOGIN_FAILS_WINDOW_SEC', String(DEFAULT_FAILS_WINDOW_SEC)),
    );
    this.lockTtlSec = Number(
      config.get<string>('LOGIN_LOCK_TTL_SEC', String(DEFAULT_LOCK_TTL_SEC)),
    );
    this.unlockTokenTtlSec = Number(
      config.get<string>('UNLOCK_TOKEN_TTL_SEC', String(DEFAULT_UNLOCK_TOKEN_TTL_SEC)),
    );
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /** True while the account is soft-locked. */
  async isLocked(email: string): Promise<boolean> {
    return (await this.redis.exists(this.lockKey(email))) === 1;
  }

  /**
   * Records a failed password attempt. Returns whether this attempt just
   * pushed us over the threshold — if so, the caller should emit the
   * account-locked event so the user's mailbox gets an unlock link.
   * The returned unlock token is what the email should contain.
   */
  async recordFailure(email: string, userId: string): Promise<FailResult> {
    const failKey = this.failsKey(email);
    const fails = await this.redis.incr(failKey);
    if (fails === 1) {
      await this.redis.expire(failKey, this.failsWindowSec);
    }
    if (fails < this.maxFails) {
      return { status: 'counted', failsSoFar: fails };
    }

    // Trip the lock. Drop the fails counter so a future unlock starts fresh.
    const unlockToken = randomBytes(32).toString('hex');
    // Two writes: lock indicator + unlock token → userId mapping. Not one Lua
    // script because the failure path is not on a hot loop and clarity beats
    // the microscopic atomicity gain here — if the second SET fails, the
    // lock still exists (safer state) and the user can request another via
    // a follow-up wrong-password attempt.
    await this.redis.set(this.lockKey(email), '1', 'EX', this.lockTtlSec);
    await this.redis.set(
      this.unlockTokenKey(unlockToken),
      userId,
      'EX',
      this.unlockTokenTtlSec,
    );
    await this.redis.del(failKey);

    this.logger.warn(
      `Soft-locking account ${maskEmail(email)} after ${this.maxFails} failed attempts`,
    );
    return { status: 'lockedNow', unlockToken };
  }

  /** Clears the failure counter on a successful login. */
  async recordSuccess(email: string): Promise<void> {
    await this.redis.del(this.failsKey(email));
  }

  /**
   * Consumes an unlock token (single-use via GETDEL — audit rule 3). On
   * success, clears the soft-lock for the owning account so the next login
   * proceeds normally.
   */
  async consumeUnlockToken(
    token: string,
    lookupEmailByUserId: (userId: string) => Promise<string | null>,
  ): Promise<ConsumeUnlockResult> {
    const userId = await this.redis.getdel(this.unlockTokenKey(token));
    if (!userId) {
      return { status: 'invalid' };
    }
    const email = await lookupEmailByUserId(userId);
    if (!email) {
      // The user was deleted between issue and consume — treat as invalid.
      this.logger.warn(`Unlock token consumed but user ${userId} is gone`);
      return { status: 'invalid' };
    }
    await this.redis.del(this.lockKey(email), this.failsKey(email));
    return { status: 'ok', userId };
  }

  /** Test-only helpers so specs don't have to reach into Redis directly. */
  async resetForTest(email: string): Promise<void> {
    await this.redis.del(this.failsKey(email), this.lockKey(email));
  }
  async peekUnlockTokenForTest(token: string): Promise<string | null> {
    return this.redis.get(this.unlockTokenKey(token));
  }

  private failsKey(email: string): string {
    return `login-fails:${email.toLowerCase()}`;
  }
  private lockKey(email: string): string {
    return `login-locked:${email.toLowerCase()}`;
  }
  private unlockTokenKey(token: string): string {
    return `unlock-token:${token}`;
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
