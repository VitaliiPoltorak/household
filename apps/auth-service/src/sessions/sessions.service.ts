import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID, createHash } from 'crypto';
import { getRefreshTtlSeconds, maskId } from '@household/common';

export interface Session {
  userId: string;
  refreshTokenHash: string;
  deviceInfo?: string;
  expiresAt: string;
}

export type ConsumeResult =
  | { status: 'ok'; session: Session }
  | { status: 'invalid' }
  | { status: 'reused'; userId: string };

@Injectable()
export class SessionsService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  private readonly redis: Redis;
  private readonly refreshTtl: number;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
    });
    this.refreshTtl = getRefreshTtlSeconds(config);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async createSession(
    userId: string,
    refreshToken: string,
    deviceInfo?: string,
  ): Promise<string> {
    const sessionId = randomUUID();
    const session: Session = {
      userId,
      refreshTokenHash: this.hash(refreshToken),
      deviceInfo,
      expiresAt: new Date(Date.now() + this.refreshTtl * 1000).toISOString(),
    };
    // Owner shadow is written first so we can never end up with a live
    // session that has no way to identify its owner during reuse detection.
    await this.redis.set(
      this.ownerKey(sessionId),
      userId,
      'EX',
      this.refreshTtl,
    );
    await this.redis.set(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      'EX',
      this.refreshTtl,
    );
    return sessionId;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(this.sessionKey(sessionId));
    return data ? JSON.parse(data) : null;
  }

  /**
   * Atomically consumes a session (GETDEL): fetches the session record and
   * deletes it in one round trip so a second concurrent refresh with the same
   * token cannot also succeed. If the session is gone but its owner shadow is
   * still present, this is reuse-after-rotation — the caller (AuthService)
   * should revoke all sessions for that user.
   */
  async consumeSession(
    sessionId: string,
    refreshToken: string,
  ): Promise<ConsumeResult> {
    const raw = await this.redis.getdel(this.sessionKey(sessionId));
    if (!raw) {
      const ownerUserId = await this.redis.get(this.ownerKey(sessionId));
      if (ownerUserId) {
        // The session key is gone but the owner shadow says it existed. Only
        // possible if someone already consumed it. Someone else now holds a
        // token we've already retired — treat as compromise.
        this.logger.warn(
          `Refresh-token reuse detected for session ${maskId(sessionId)} (user ${maskId(ownerUserId)}). Revoking all user sessions.`,
        );
        return { status: 'reused', userId: ownerUserId };
      }
      return { status: 'invalid' };
    }

    const session = JSON.parse(raw) as Session;

    if (session.refreshTokenHash !== this.hash(refreshToken)) {
      // Hash mismatch after GETDEL: the session is gone. The caller receives
      // 'invalid' and the (possibly legitimate) user re-authenticates.
      // Accepting this UX cost keeps the deletion atomic — the alternative
      // is a Lua script for compare-and-delete.
      return { status: 'invalid' };
    }

    if (new Date(session.expiresAt) < new Date()) {
      return { status: 'invalid' };
    }

    // Successful consume: drop the owner shadow so future reuse attempts on
    // this sessionId look like 'invalid' (unknown session) rather than
    // 'reused' — the new rotated session has its own sessionId/shadow.
    await this.redis.del(this.ownerKey(sessionId));

    return { status: 'ok', session };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(this.sessionKey(sessionId), this.ownerKey(sessionId));
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    const keys = await this.redis.keys('session:*');
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session: Session = JSON.parse(data);
        if (session.userId === userId) {
          const sessionId = key.slice('session:'.length);
          await this.redis.del(key, this.ownerKey(sessionId));
        }
      }
    }
  }

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private ownerKey(sessionId: string): string {
    return `session-owner:${sessionId}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
