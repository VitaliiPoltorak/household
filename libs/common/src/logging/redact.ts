/**
 * PII-safe log formatting helpers (#59).
 *
 * Log storage frequently outlives its intended access boundary (SaaS
 * providers, shared bucket exports, incident forwarding). Raw userIds,
 * emails, tokens leaking into that pipeline is a passive data-loss surface.
 * Keep just enough of each identifier to correlate across log lines during
 * debugging, drop the rest.
 */

/**
 * Returns the last 4 characters of an identifier, prefixed with an ellipsis.
 * Enough entropy to correlate log lines within a single incident window, not
 * enough to reconstruct the original UUID / email / token.
 *
 * Examples:
 *   maskId('550e8400-e29b-41d4-a716-446655440000') -> '…0000'
 *   maskId('user@example.com')                     -> '….com'
 *   maskId(undefined)                              -> '…'
 *   maskId('abc')                                  -> '…abc' (short input passes through)
 */
export function maskId(value: string | null | undefined): string {
  if (!value) return '…';
  if (value.length <= 4) return `…${value}`;
  return `…${value.slice(-4)}`;
}

/**
 * Fields the redactor should always strip from an object before logging.
 * Extend as new sensitive shapes appear.
 */
const REDACTED_KEYS = new Set(['userId', 'email', 'token', 'accessToken', 'refreshToken', 'authorization', 'password']);

/**
 * Shallow-redacts an object for structured logging. Non-object input passes
 * through unchanged. Values under any REDACTED_KEYS entry are replaced with
 * a masked form via {@link maskId}; nested objects are recursed once.
 *
 * Not a security control — this is a defence-in-depth wrapper for cases
 * where log payloads accidentally include user records. First line of
 * defence is still: don't put raw PII into log messages.
 */
export function redactForLog<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactForLog) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key)) {
      out[key] = typeof v === 'string' ? maskId(v) : '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[key] = redactForLog(v);
    } else {
      out[key] = v;
    }
  }
  return out as T;
}
