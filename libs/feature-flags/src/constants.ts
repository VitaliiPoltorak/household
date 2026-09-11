import {
  FEATURE_FLAG_UPDATED_EVENT,
  type FeatureFlagState,
} from '@household/contracts';

export { FEATURE_FLAG_UPDATED_EVENT };

/**
 * String DI token for the ioredis client. Not a Symbol/InjectionToken of our
 * own — every service that adopts feature flags already declares a
 * `@Global()` RedisModule exporting a client under this exact string
 * (apps/household-service/src/redis/redis.module.ts,
 * apps/integration-service/src/redis/redis.module.ts are byte-identical
 * copies of each other). Reusing the string means FeatureFlagsModule.register()
 * opens no second Redis connection — it rides whatever the app already
 * provides.
 */
export const REDIS_CLIENT_TOKEN = 'REDIS_CLIENT';

export const FEATURE_FLAGS_SERVICE_NAME = 'FEATURE_FLAGS_SERVICE_NAME';

export const FEATURE_FLAG_CACHE_TTL_SECONDS = 60;

export function defaultCacheKey(flagKey: string): string {
  return `flag:${flagKey}:default`;
}

export function householdCacheKey(
  flagKey: string,
  householdId: string,
): string {
  return `flag:${flagKey}:household:${householdId}`;
}

export function userCacheKey(flagKey: string, userId: string): string {
  return `flag:${flagKey}:user:${userId}`;
}

export function encodeState(state: FeatureFlagState): string {
  return state === true ? '1' : state === false ? '0' : 'none';
}

export function decodeState(raw: string | null): FeatureFlagState | null {
  if (raw === null) return null;
  if (raw === '1') return true;
  if (raw === '0') return false;
  return 'none';
}
