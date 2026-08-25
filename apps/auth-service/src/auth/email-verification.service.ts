import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomInt } from 'crypto';
import { maskEmail } from '@household/common';

export type VerifyResult =
  | { status: 'ok' }
  | { status: 'wrong'; attemptsRemaining: number }
  | { status: 'exhausted' }
  | { status: 'missing' };

/**
 * Owns the 6-digit email verification code lifecycle in Redis.
 *
 * Correctness constraint: verify must be atomic — a legitimate user racing
 * with an attacker on the same key must not let both succeed, and a wrong-
 * code attempt must increment the counter without a TOCTOU window. GETDEL
 * alone can't express "delete on match, otherwise increment attempts", so
 * this uses a single Lua script that Redis executes atomically. Same
 * atomicity guarantee as GETDEL (audit rule 3), extended with the attempts
 * counter.
 */
@Injectable()
export class EmailVerificationService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly redis: Redis;
  private readonly ttlSec: number;
  private readonly maxAttempts: number;

  // KEYS[1] = redis key, ARGV[1] = submitted code
  // Returns: {'ok'} | {'wrong', <remaining:int>} | {'exhausted'} | {'missing'}
  //
  // Uses cjson (bundled with Redis) — we could instead pack code+attempts as
  // a delimited string, but JSON keeps the storage shape self-describing when
  // eyeballed with redis-cli during triage.
  private static readonly VERIFY_LUA = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then
      return {'missing'}
    end
    local data = cjson.decode(raw)
    if data.code == ARGV[1] then
      redis.call('DEL', KEYS[1])
      return {'ok'}
    end
    data.attempts = data.attempts + 1
    local max = tonumber(ARGV[2])
    if data.attempts >= max then
      redis.call('DEL', KEYS[1])
      return {'exhausted'}
    end
    local ttl = redis.call('PTTL', KEYS[1])
    if ttl < 0 then ttl = 1000 end
    redis.call('SET', KEYS[1], cjson.encode(data), 'PX', ttl)
    return {'wrong', tostring(max - data.attempts)}
  `;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
    });
    this.ttlSec = Number(
      config.get<string>('EMAIL_VERIFICATION_TTL_SEC', '900'),
    );
    this.maxAttempts = Number(
      config.get<string>('EMAIL_VERIFICATION_MAX_ATTEMPTS', '5'),
    );
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Generates a fresh code, replacing any existing one for this email and
   * resetting the attempts counter. Returns the plaintext code so the caller
   * can log it in dev and, once notification-service is ready (#30), push it
   * onto a Kafka event.
   */
  async issueCode(email: string): Promise<string> {
    const code = this.generateCode();
    const payload = JSON.stringify({ code, attempts: 0 });
    await this.redis.set(this.key(email), payload, 'EX', this.ttlSec);
    return code;
  }

  async verifyCode(
    email: string,
    submittedCode: string,
  ): Promise<VerifyResult> {
    const result = (await this.redis.eval(
      EmailVerificationService.VERIFY_LUA,
      1,
      this.key(email),
      submittedCode,
      String(this.maxAttempts),
    )) as string[];

    const [status, arg] = result;
    switch (status) {
      case 'ok':
        return { status: 'ok' };
      case 'wrong':
        return { status: 'wrong', attemptsRemaining: Number(arg) };
      case 'exhausted':
        this.logger.warn(
          `Email verification exhausted for ${maskEmail(email)} — code invalidated after ${this.maxAttempts} wrong attempts`,
        );
        return { status: 'exhausted' };
      case 'missing':
        return { status: 'missing' };
      default:
        // Defensive — Lua script contract is fixed above, but if it ever
        // drifts we don't want to accidentally return 'ok'.
        this.logger.error(
          `Unexpected verify result: ${JSON.stringify(result)}`,
        );
        return { status: 'missing' };
    }
  }

  /** Test-only helper — inspect what's in Redis without consuming the code. */
  async peekForTest(
    email: string,
  ): Promise<{ code: string; attempts: number } | null> {
    const raw = await this.redis.get(this.key(email));
    return raw ? JSON.parse(raw) : null;
  }

  /** Test-only helper — collapse the TTL so "expired code" cases don't need real waits. */
  async forceExpireForTest(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }

  private key(email: string): string {
    return `email_verify:${email.toLowerCase()}`;
  }

  private generateCode(): string {
    // randomInt is CSPRNG-backed; range gives a uniformly-distributed 6-digit
    // number. String pad handles the (rare) leading-zero case.
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }
}
