import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  getFeatureFlagDefinition,
  FeatureFlagState,
} from '@household/contracts';
import { FeatureFlagClientService } from './feature-flag-client.service';
import {
  REDIS_CLIENT_TOKEN,
  FEATURE_FLAG_CACHE_TTL_SECONDS,
  defaultCacheKey,
  householdCacheKey,
  userCacheKey,
  encodeState,
  decodeState,
} from './constants';

export interface FeatureFlagActor {
  userId?: string;
  householdId?: string;
}

/**
 * Resolves a flag for one actor: user override -> household override ->
 * global default -> (household-service unreachable) registry default.
 *
 * Caches the three underlying states separately, not one combined result —
 * a household-level toggle must be invalidatable without knowing every user
 * who might be cached against it. See libs/feature-flags README block / the
 * feature-flags skill for the key layout.
 */
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  constructor(
    @Inject(REDIS_CLIENT_TOKEN) private readonly redis: Redis,
    private readonly client: FeatureFlagClientService,
  ) {}

  async isEnabled(
    flagKey: string,
    actor: FeatureFlagActor = {},
  ): Promise<boolean> {
    const registryDefault =
      getFeatureFlagDefinition(flagKey)?.enabledDefault ?? false;

    const defKey = defaultCacheKey(flagKey);
    const hhKey = actor.householdId
      ? householdCacheKey(flagKey, actor.householdId)
      : undefined;
    const usrKey = actor.userId
      ? userCacheKey(flagKey, actor.userId)
      : undefined;

    const keys = [defKey, hhKey, usrKey].filter((k): k is string => !!k);
    const raw = await this.redis.mget(...keys);
    const byKey = new Map(keys.map((k, i) => [k, raw[i]] as const));

    // The 'default' cache key only ever holds '1'/'0' (never 'none' — a
    // flag always has an enabledDefault), so this narrows the general
    // FeatureFlagState decode result down to what's actually possible here.
    let defaultState = decodeState(byKey.get(defKey) ?? null) as boolean | null;
    let householdState: FeatureFlagState = hhKey
      ? (decodeState(byKey.get(hhKey) ?? null) ?? 'none')
      : 'none';
    let userState: FeatureFlagState = usrKey
      ? (decodeState(byKey.get(usrKey) ?? null) ?? 'none')
      : 'none';
    const missed =
      defaultState === null ||
      (hhKey !== undefined && byKey.get(hhKey) === null) ||
      (usrKey !== undefined && byKey.get(usrKey) === null);

    if (missed) {
      try {
        const fetched = await this.client.fetchState(flagKey, actor);
        defaultState = fetched.default;
        householdState = hhKey ? fetched.household : 'none';
        userState = usrKey ? fetched.user : 'none';
        await this.populateCache(flagKey, actor, fetched);
      } catch (err) {
        this.logger.warn(
          `Failed to resolve flag '${flagKey}' from household-service, falling back to registry default (${registryDefault}): ${(err as Error).message}`,
        );
        return registryDefault;
      }
    }

    if (userState === true || userState === false) return userState;
    if (householdState === true || householdState === false)
      return householdState;
    return defaultState ?? registryDefault;
  }

  private async populateCache(
    flagKey: string,
    actor: FeatureFlagActor,
    fetched: {
      default: boolean;
      household: FeatureFlagState;
      user: FeatureFlagState;
    },
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.set(
      defaultCacheKey(flagKey),
      encodeState(fetched.default),
      'EX',
      FEATURE_FLAG_CACHE_TTL_SECONDS,
    );
    if (actor.householdId) {
      pipeline.set(
        householdCacheKey(flagKey, actor.householdId),
        encodeState(fetched.household),
        'EX',
        FEATURE_FLAG_CACHE_TTL_SECONDS,
      );
    }
    if (actor.userId) {
      pipeline.set(
        userCacheKey(flagKey, actor.userId),
        encodeState(fetched.user),
        'EX',
        FEATURE_FLAG_CACHE_TTL_SECONDS,
      );
    }
    await pipeline.exec();
  }
}
