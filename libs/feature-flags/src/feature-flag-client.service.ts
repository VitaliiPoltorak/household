import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  signHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from '@household/common';
import type { FeatureFlagState } from '@household/contracts';

export interface RawFeatureFlagStates {
  default: boolean;
  household: FeatureFlagState;
  user: FeatureFlagState;
}

/**
 * Calls household-service's `GET /feature-flags/:flagKey/state` directly
 * (HOUSEHOLD_SERVICE_URL, service-to-service — not through the gateway,
 * even though that same path is also gateway-reachable via
 * apps/api-gateway/src/proxy/routes.default.json's generic
 * /api/v1/feature-flags prefix). Signs X-User-Id/X-Household-Id the same
 * way MembershipService (realtime-gateway) and FinanceClientService
 * (integration-service) already do, so household-service's existing
 * gateway-signature middleware accepts the call under the same trust
 * boundary as api-gateway — no new auth mechanism.
 */
@Injectable()
export class FeatureFlagClientService {
  private readonly baseUrl: string;
  private readonly signingSecret: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>(
      'HOUSEHOLD_SERVICE_URL',
      'http://localhost:3002',
    );
    this.signingSecret = config.get<string>('GATEWAY_SIGNING_SECRET');
  }

  async fetchState(
    flagKey: string,
    actor: { userId?: string; householdId?: string },
  ): Promise<RawFeatureFlagStates> {
    const res = await fetch(
      `${this.baseUrl}/feature-flags/${encodeURIComponent(flagKey)}/state`,
      {
        headers: this.buildHeaders(actor),
      },
    );
    if (!res.ok) {
      throw new Error(
        `household-service returned ${res.status} resolving flag ${flagKey}`,
      );
    }
    return (await res.json()) as RawFeatureFlagStates;
  }

  private buildHeaders(actor: {
    userId?: string;
    householdId?: string;
  }): Record<string, string> {
    const headers: Record<string, string> = {};
    if (actor.userId) headers['X-User-Id'] = actor.userId;
    if (actor.householdId) headers['X-Household-Id'] = actor.householdId;

    // No trust headers at all -> household-service's gateway-signature
    // middleware treats this as a public request and skips verification;
    // signing an empty header set would be pointless.
    if (!this.signingSecret || (!actor.userId && !actor.householdId))
      return headers;

    const signed = signHeaders(actor, this.signingSecret);
    headers[SIGNATURE_HEADER] = signed[SIGNATURE_HEADER];
    headers[TIMESTAMP_HEADER] = signed[TIMESTAMP_HEADER];
    return headers;
  }
}
