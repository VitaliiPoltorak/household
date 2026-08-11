import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Minimal in-memory throttle for the on-demand rates refresh endpoint.
 *
 * Why not `@nestjs/throttler`?
 *   - not a dependency of finance-service (would need a new install)
 *   - the rest of finance-service has no per-endpoint throttling infra
 *   - api-gateway already throttles globally per-IP, but we want per-user here
 *
 * Why in-memory (Map) rather than Redis?
 *   - finance-service is deployed as a single instance today (docker-compose)
 *   - keeps the change surface tiny and dependency-free
 *
 * If finance-service is later horizontally scaled, swap the Map for a shared
 * Redis-backed store (see apps/api-gateway/src/throttler/redis-throttler.storage.ts).
 */
@Injectable()
export class RatesRefreshThrottleGuard implements CanActivate {
  private static readonly WINDOW_MS = 60_000;
  private static readonly MAX_ENTRIES = 10_000; // hard cap to bound memory
  private readonly lastHitByKey = new Map<string, number>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = this.getKey(req);
    const now = Date.now();

    this.evictExpired(now);

    const previous = this.lastHitByKey.get(key);
    if (previous !== undefined && now - previous < RatesRefreshThrottleGuard.WINDOW_MS) {
      const retryAfterSec = Math.ceil(
        (RatesRefreshThrottleGuard.WINDOW_MS - (now - previous)) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rates can be refreshed at most once per minute. Try again in ${retryAfterSec}s.`,
          error: 'Too Many Requests',
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.lastHitByKey.set(key, now);
    return true;
  }

  private getKey(req: Request): string {
    const userIdRaw = req.headers['x-user-id'];
    const userId = Array.isArray(userIdRaw) ? userIdRaw[0] : userIdRaw;
    if (userId && userId.length > 0) return `user:${userId}`;
    // No user id → fall back to IP so anonymous callers (should not happen in
    // production because gateway enforces JWT) still get throttled.
    return `ip:${req.ip ?? 'unknown'}`;
  }

  private evictExpired(now: number): void {
    if (this.lastHitByKey.size < RatesRefreshThrottleGuard.MAX_ENTRIES) return;
    for (const [k, ts] of this.lastHitByKey) {
      if (now - ts >= RatesRefreshThrottleGuard.WINDOW_MS) {
        this.lastHitByKey.delete(k);
      }
    }
  }
}
