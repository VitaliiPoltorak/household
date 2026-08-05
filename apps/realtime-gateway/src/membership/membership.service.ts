import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Maintains a per-user set of household IDs the user is a member of.
 * - Populated lazily on first check via a call to household-service.
 * - Invalidated by Kafka events (household.member.joined / removed / household.created)
 *   handled in KafkaBridgeService so mid-session changes are reflected without
 *   waiting for reconnect.
 *
 * Trust model: calls household-service directly with X-User-Id (same pattern
 * as api-gateway → services). Cross-service header trust is tracked
 * separately in Sec#46 and will be hardened globally.
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);
  private readonly cache = new Map<string, Set<string>>();
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('HOUSEHOLD_SERVICE_URL', 'http://localhost:3002');
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
        headers: { 'X-User-Id': userId },
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
}
