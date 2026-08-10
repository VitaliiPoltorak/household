import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'household:audit';

export interface AuditMetadata {
  action: string;
  resourceType?: string;
  /** Name of a route param whose value should be stored as resourceId. */
  resourceIdParam?: string;
}

/**
 * Mark a controller method as an audit-worthy action. The AuditInterceptor
 * reads this metadata and writes a row to audit_log after the handler
 * returns 2xx. Failures do NOT record — an errored action didn't happen.
 *
 * Example:
 *   @Audit({ action: 'finance.transaction.delete', resourceType: 'transaction', resourceIdParam: 'id' })
 *   @Delete(':id')
 *   remove(...) { ... }
 */
export const Audit = (meta: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, meta);
