import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { signHeaders, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@household/common';

/**
 * Maintains a per-user set of household IDs the user is a member of.
 * - Populated lazily on first check via a call to household-service.
 * - Invalidated by Kafka events (household.member.joined / removed / household.created)
 *   handled in KafkaBridgeService so mid-session changes are reflected without
 *   waiting for reconnect.
 *
 * Trust model: signs X-User-Id with GATEWAY_SIGNING_SECRET so household-service
 * accepts the request under the same policy it applies to api-gateway.
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);
  private readonly cache = new Map<string, Set<string>>();
  private readonly baseUrl: string;
  private readonly signingSecret: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('HOUSEHOLD_SERVICE_URL', 'http://localhost:3002');
    this.signingSecret = config.get<string>('GATEWAY_SIGNING_SECRET');
  }

  async isMember(userId: string, householdId: string): Promise<boolean> {
    const memberships = await this.getMemberships(userId);
    return memberships.has(householdId);
  }

  async getMemberships(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const fresh = await this.fetchMemberships(userId);
    this.cache.set(userId, fresh);
    return fresh;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private async fetchMemberships(userId: string): Promise<Set<string>> {
    try {
      const res = await fetch(`${this.baseUrl}/households`, {
        headers: this.buildHeaders(userId),
      });
      if (!res.ok) {
        this.logger.warn(`household-service returned ${res.status} for user ${userId}`);
        return new Set();
      }
      const list = (await res.json()) as Array<{ id: string }>;
      return new Set(list.map((h) => h.id));
    } catch (err) {
      this.logger.error(`Failed to fetch memberships for user ${userId}: ${(err as Error).message}`);
      return new Set();
    }
  }

  private buildHeaders(userId: string): Record<string, string> {
    if (!this.signingSecret) {
      return { 'X-User-Id': userId };
    }
    const signed = signHeaders({ userId }, this.signingSecret);
    return {
      'X-User-Id': userId,
      [SIGNATURE_HEADER]: signed[SIGNATURE_HEADER],
      [TIMESTAMP_HEADER]: signed[TIMESTAMP_HEADER],
    };
  }
}
