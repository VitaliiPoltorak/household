import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID, createHash } from 'crypto';

export interface Session {
  userId: string;
  refreshTokenHash: string;
  deviceInfo?: string;
  expiresAt: string;
}

@Injectable()
export class SessionsService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly refreshTtl: number;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
      lazyConnect: true,
    });
    this.refreshTtl = config.get<number>('JWT_REFRESH_EXPIRES_DAYS', 30) * 86400;
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
    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify(session),
      'EX',
      this.refreshTtl,
    );
    return sessionId;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async validateRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    if (session.refreshTokenHash !== this.hash(refreshToken)) return null;
    if (new Date(session.expiresAt) < new Date()) {
      await this.deleteSession(sessionId);
      return null;
    }
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    const keys = await this.redis.keys('session:*');
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session: Session = JSON.parse(data);
        if (session.userId === userId) {
          await this.redis.del(key);
        }
      }
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
