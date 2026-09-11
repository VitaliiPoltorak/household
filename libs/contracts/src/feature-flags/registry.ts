/**
 * Static, in-git metadata for every feature flag. The DB (owned by
 * household-service) only holds the mutable runtime `enabled` state per
 * actor — this registry is what lets `expires_at` be enforced in CI without
 * a live DB (see feature-flags/registry.spec.ts in this package).
 *
 * See the `feature-flags` skill and CLAUDE.md's "Feature flags" section for
 * the full design (schema, resolution order, caching/invalidation).
 */

export type FeatureFlagStatus = 'dev' | 'beta' | 'kill-switch';

export interface FeatureFlagDefinition {
  key: string;
  description: string;
  status: FeatureFlagStatus;
  /** Global default when no household/user override exists. */
  enabledDefault: boolean;
  /**
   * ISO 8601 date. Required unless status is 'kill-switch'. A CI check
   * fails the build once this date is in the past — the flag and every
   * @RequireFeature usage referencing it must be deleted first.
   */
  expiresAt?: string;
  /** Required once status moves from 'dev' to 'beta'. */
  rolloutIssueUrl?: string;
}

export const FEATURE_FLAGS: readonly FeatureFlagDefinition[] = [
  {
    key: 'monobank-integration',
    description:
      'Monobank bank-connection feature in integration-service (connect, sync, transaction mapping). Emergency off-switch for outages/load on the Monobank API, not a rollout flag — the feature has been fully shipped since #20/#21.',
    status: 'kill-switch',
    enabledDefault: true,
  },
];

export function getFeatureFlagDefinition(
  key: string,
): FeatureFlagDefinition | undefined {
  return FEATURE_FLAGS.find((f) => f.key === key);
}
