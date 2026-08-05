import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-gateway-signature';
export const TIMESTAMP_HEADER = 'x-gateway-timestamp';

export interface TrustedHeaders {
  userId?: string;
  householdId?: string;
  email?: string;
}

export interface SignedHeaders extends TrustedHeaders {
  [SIGNATURE_HEADER]: string;
  [TIMESTAMP_HEADER]: string;
}

/**
 * Canonical representation of the trust headers. Order matters — both sides
 * must build the same string. Missing headers use empty string so absence
 * cannot be forged into presence.
 */
function canonicalize(headers: TrustedHeaders, timestamp: string): string {
  return [
    `t=${timestamp}`,
    `uid=${headers.userId ?? ''}`,
    `hid=${headers.householdId ?? ''}`,
    `email=${headers.email ?? ''}`,
  ].join('|');
}

export function computeSignature(
  headers: TrustedHeaders,
  timestamp: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(canonicalize(headers, timestamp))
    .digest('hex');
}

export function signHeaders(headers: TrustedHeaders, secret: string): SignedHeaders {
  const timestamp = Date.now().toString();
  return {
    ...headers,
    [SIGNATURE_HEADER]: computeSignature(headers, timestamp, secret),
    [TIMESTAMP_HEADER]: timestamp,
  };
}

export interface VerifyOptions {
  /** Reject if signature timestamp is older than this many ms. Default 5 minutes. */
  maxAgeMs?: number;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'missing_signature' | 'missing_timestamp' | 'expired' | 'invalid_signature' };

export function verifySignature(
  headers: TrustedHeaders,
  providedSignature: string | undefined,
  providedTimestamp: string | undefined,
  secret: string,
  opts: VerifyOptions = {},
): VerifyResult {
  const maxAgeMs = opts.maxAgeMs ?? 5 * 60 * 1000;

  if (!providedSignature) return { valid: false, reason: 'missing_signature' };
  if (!providedTimestamp) return { valid: false, reason: 'missing_timestamp' };

  const ts = Number(providedTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxAgeMs) {
    return { valid: false, reason: 'expired' };
  }

  const expected = computeSignature(headers, providedTimestamp, secret);
  const a = Buffer.from(providedSignature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'invalid_signature' };
  }
  return { valid: true };
}
