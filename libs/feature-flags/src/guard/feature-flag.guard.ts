import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_FEATURE_METADATA_KEY } from '../require-feature.decorator';
import { FeatureFlagService } from '../feature-flag.service';

/**
 * Reads @RequireFeature('flag-key') off the handler and 503s the request
 * when the flag resolves to disabled for the caller. No metadata -> not
 * gated -> allow, same "opt-in metadata, Reflector-driven" shape as
 * @household/audit's AuditInterceptor.
 *
 * 503 (not 403/404): this is "temporarily unavailable", distinct from
 * "you're not allowed" or "doesn't exist" — and gives callers a status to
 * branch on deliberately rather than string-matching an error body.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.get<string | undefined>(
      REQUIRE_FEATURE_METADATA_KEY,
      ctx.getHandler(),
    );
    if (!flagKey) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const userId = firstHeader(req.headers['x-user-id']);
    const householdId = firstHeader(req.headers['x-household-id']);

    const enabled = await this.flags.isEnabled(flagKey, {
      userId,
      householdId,
    });
    if (!enabled) {
      throw new ServiceUnavailableException(
        `Feature '${flagKey}' is currently disabled`,
      );
    }
    return true;
  }
}

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
