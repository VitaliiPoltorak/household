import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const PLACEHOLDER_KEYS = new Set([
  'change-me-in-production',
  'change-me',
  'dev-secret',
  'secret',
]);
const MIN_KEY_LENGTH = 32;

/**
 * Bootstrap-time helper, mirrors requireStrongJwtSecret. Returns
 * TOKEN_ENCRYPTION_KEY after validating it. In production, refuses to start
 * if the key is missing, matches a known placeholder, or is shorter than 32
 * chars. In dev/test, only requires presence.
 */
export function requireStrongEncryptionKey(config: ConfigService): string {
  const key = config.getOrThrow<string>('TOKEN_ENCRYPTION_KEY');
  if (config.get<string>('NODE_ENV') !== 'production') return key;

  if (PLACEHOLDER_KEYS.has(key)) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is set to a known placeholder value. Generate a strong key (e.g. openssl rand -base64 48) before starting in production.',
    );
  }
  if (key.length < MIN_KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters in production (got ${key.length}). Refusing to start.`,
    );
  }
  return key;
}

// AES-256-GCM needs an exact 32-byte key. Deriving one from an arbitrary
// passphrase (rather than requiring operators to generate raw key bytes)
// keeps this consistent with how JWT_SECRET is configured elsewhere.
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypts `plaintext` (e.g. a third-party API token) for storage at rest.
 * Output is `base64(iv || authTag || ciphertext)` — self-contained, no
 * separate IV column needed.
 */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

/**
 * Reverses encryptSecret(). Throws if `secret` doesn't match or the payload
 * was tampered with (GCM auth tag verification fails).
 */
export function decryptSecret(payload: string, secret: string): string {
  const key = deriveKey(secret);
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
