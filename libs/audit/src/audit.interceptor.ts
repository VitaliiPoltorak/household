import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_METADATA_KEY, AuditMetadata } from './audit.decorator';
import { AuditService } from './audit.service';

/**
 * Writes an audit row after any handler decorated with @Audit() completes
 * successfully. Failures skip the log — an errored action didn't happen.
 *
 * Actor & household are pulled from the gateway-set request headers
 * (X-User-Id, X-Household-Id) rather than the JWT, matching how every
 * downstream service already trusts those headers.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata>(
      AUDIT_METADATA_KEY,
      ctx.getHandler(),
    );
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      params?: Record<string, string>;
      body?: unknown;
      method?: string;
      url?: string;
    }>();

    const header = (k: string): string | null => {
      const v = req.headers[k.toLowerCase()];
      return typeof v === 'string' ? v : null;
    };

    const actorUserId = header('x-user-id');
    const householdId = header('x-household-id');
    const resourceId = meta.resourceIdParam ? req.params?.[meta.resourceIdParam] ?? null : null;

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget — AuditService already swallows its own errors
        // and never rejects, but await'ing here would gate the response
        // on the audit write. That's not the tradeoff we want.
        void this.audit.record({
          actorUserId,
          householdId,
          action: meta.action,
          resourceType: meta.resourceType ?? null,
          resourceId,
          metadata: {
            method: req.method,
            path: req.url,
          },
        });
      }),
    );
  }
}
