import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_METADATA_KEY = 'household:require-feature';

/**
 * Mark a controller method as gated behind a feature flag. FeatureFlagGuard
 * reads this metadata and throws 503 when the flag resolves to disabled for
 * the caller (see FeatureFlagService.isEnabled for the resolution order).
 *
 * Example:
 *   @RequireFeature('monobank-integration')
 *   @Post('sync')
 *   sync(...) { ... }
 */
export const RequireFeature = (flagKey: string) =>
  SetMetadata(REQUIRE_FEATURE_METADATA_KEY, flagKey);
