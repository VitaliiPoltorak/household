import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IOAuthStrategy,
  OAUTH_STRATEGIES,
} from './oauth-strategy.interface';

/**
 * Registry that resolves OAuth strategies by their provider slug.
 *
 * Adding a new provider requires a new strategy class implementing
 * {@link IOAuthStrategy} and a single multi-binding under
 * {@link OAUTH_STRATEGIES} in `AuthModule` — no controller edits.
 */
@Injectable()
export class OAuthStrategyRegistry {
  private readonly map: Map<string, IOAuthStrategy>;

  constructor(
    @Inject(OAUTH_STRATEGIES) strategies: IOAuthStrategy[],
  ) {
    this.map = new Map(strategies.map((s) => [s.provider, s]));
  }

  /**
   * @throws NotFoundException when no strategy is registered for `provider`.
   */
  get(provider: string): IOAuthStrategy {
    const strategy = this.map.get(provider);
    if (!strategy) {
      throw new NotFoundException(`Unknown OAuth provider: ${provider}`);
    }
    return strategy;
  }

  /** All registered provider slugs, in insertion order. */
  list(): string[] {
    return [...this.map.keys()];
  }
}
