import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

// Serialised metadata payload is capped so a runaway blob (accidentally
// including a large response body, base64 file, etc.) can't fill the table.
const MAX_METADATA_BYTES = 8 * 1024;

export interface AuditRecord {
  actorUserId?: string | null;
  householdId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(input: AuditRecord): Promise<void> {
    const metadata = this.truncate(input.metadata ?? null);
    try {
      await this.repo.save(
        this.repo.create({
          actorUserId: input.actorUserId ?? null,
          householdId: input.householdId ?? null,
          action: input.action,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          metadata,
        }),
      );
    } catch (err) {
      // Auditing must never break a business action. Log and move on —
      // ops can trace the missing entry back via the log line.
      this.logger.error(
        `Failed to persist audit entry action=${input.action}: ${(err as Error).message}`,
      );
    }
  }

  private truncate(m: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!m) return null;
    const serialised = JSON.stringify(m);
    if (serialised.length <= MAX_METADATA_BYTES) return m;
    return { _truncated: true, size: serialised.length };
  }
}
