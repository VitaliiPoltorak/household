import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

type StorageRecord = { totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number };

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<StorageRecord> {
    const blockKey = `throttler:block:${key}`;
    const countKey = `throttler:count:${key}`;

    const blocked = await this.redis.get(blockKey);
    if (blocked) {
      const timeToBlockExpire = Math.max(await this.redis.ttl(blockKey), 0);
      return { totalHits: limit + 1, timeToExpire: 0, isBlocked: true, timeToBlockExpire };
    }

    const totalHits = await this.redis.incr(countKey);
    if (totalHits === 1) {
      await this.redis.expire(countKey, ttl);
    }

    const timeToExpire = Math.max(await this.redis.ttl(countKey), 0);

    if (totalHits > limit) {
      await this.redis.setex(blockKey, blockDuration, '1');
      await this.redis.del(countKey);
      return { totalHits, timeToExpire: 0, isBlocked: true, timeToBlockExpire: blockDuration };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
