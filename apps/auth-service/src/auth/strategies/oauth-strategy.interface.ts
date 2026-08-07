import { OAuthProfile } from '../../users/users.service';

/**
 * DI token for the multi-provider array of registered OAuth strategies.
 * Each strategy binds itself under this token with `multi: true`.
 */
export const OAUTH_STRATEGIES = Symbol('OAUTH_STRATEGIES');

/**
 * Contract every OAuth provider strategy must implement.
 *
 * Kept inside auth-service (not `libs/contracts`) — this is an auth-internal
 * contract with no cross-service consumers.
 */
export interface IOAuthStrategy {
  /** Canonical, lowercase provider slug — e.g. `google`, `apple`, `facebook`. */
  readonly provider: string;

  /**
   * Verify a provider-issued credential (id_token / access_token) and return
   * the normalised OAuth profile. Implementations MUST throw
   * `UnauthorizedException` on any verification failure.
   *
   * @param token Provider-issued credential from the client.
   * @param meta  Optional provider-specific extras (e.g. Apple's firstName/lastName).
   */
  validate(
    token: string,
    meta?: Record<string, unknown>,
  ): Promise<OAuthProfile>;
}
