import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Authentication for Kafka messages (#63).
 *
 * Any process with network access to the broker can publish arbitrary
 * events; consumers act on them (create memberships, adjust balances)
 * without provenance checks. This module lets services sign every message
 * on send and verify on receive using a shared HMAC-SHA256 key.
 *
 * We sign the raw wire bytes (the JSON envelope's toString()) rather than
 * a normalized subset. That's byte-exact and immune to canonicalization
 * bugs — the consumer verifies whatever it actually received.
 */

export const SIGNATURE_HEADER = 'signature';

// Header stamped by the producer so the consumer knows which key was used
// during a rotation window. Consumers verify against both known keys; the
// tag just tells the log line which slot matched.
export const SIGNATURE_KEY_ID_HEADER = 'signature-key-id';

export function signMessage(rawValue: string, key: string): string {
  return createHmac('sha256', key).update(rawValue).digest('hex');
}

/**
 * Verifies `signature` against `rawValue` using each candidate key. Returns
 * the slot ('primary' | 'previous') that matched, or null if no key did.
 * Uses timingSafeEqual to avoid signature-guessing side channels.
 */
export function verifyMessage(
  rawValue: string,
  signature: string,
  primaryKey: string,
  previousKey?: string,
): 'primary' | 'previous' | null {
  if (matches(rawValue, signature, primaryKey)) return 'primary';
  if (previousKey && matches(rawValue, signature, previousKey)) return 'previous';
  return null;
}

function matches(rawValue: string, expected: string, key: string): boolean {
  const computed = signMessage(rawValue, key);
  // Both hex strings, same length by construction.
  if (computed.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    // Length mismatch or non-hex input — safely reject.
    return false;
  }
}
