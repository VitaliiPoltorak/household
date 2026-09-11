export const FEATURE_FLAG_UPDATED_EVENT = 'feature-flag.updated';

export type FeatureFlagActorType = 'household' | 'user';

export type FeatureFlagOverrideSource = 'manual' | 'subscription';

/**
 * Cached/raw tri-state for one actor's override row: enabled, disabled, or
 * no override exists at all ('none' — distinct from disabled so a miss on
 * an actor with no override doesn't look like a cache miss on every read).
 */
export type FeatureFlagState = true | false | 'none';

export interface ResolvedFeatureFlagStates {
  default: boolean;
  household: FeatureFlagState;
  user: FeatureFlagState;
}

/**
 * Payload of the `feature-flag.updated` Kafka event. A `type` alias, not an
 * `interface` — KafkaConsumerService.subscribe<T extends Record<string,
 * unknown>>() requires its type argument to satisfy that index-signature
 * constraint, which only object-literal-shaped types do (an `interface`
 * doesn't, even with identical properties — every other consumer.subscribe<T>()
 * call in this repo uses an inline literal for the same reason).
 */
export type FeatureFlagUpdatedPayload = {
  flagKey: string;
  actorType: FeatureFlagActorType | 'default';
  actorId?: string;
};
