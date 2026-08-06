import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

// Allowlist prevents alg-confusion attacks (e.g. forged tokens with "alg: none"
// or HS256 tokens signed with a public key that the server treats as RS256).
export const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

export function verifyJwt<T = jwt.JwtPayload>(token: string, secret: string): T {
  return jwt.verify(token, secret, { algorithms: JWT_ALGORITHMS }) as T;
}

const PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'change-me',
  'dev-secret',
  'secret',
]);
const MIN_SECRET_LENGTH = 32;

/**
 * Bootstrap-time helper. Returns JWT_SECRET after validating it. In
 * production, refuses to start if the secret is missing, matches a known
 * placeholder, or is shorter than 32 chars. In dev/test, only requires
 * presence — dev secrets can be short and human-readable.
 */
export function requireStrongJwtSecret(config: ConfigService): string {
  const secret = config.getOrThrow<string>('JWT_SECRET');
  if (config.get<string>('NODE_ENV') !== 'production') return secret;

  if (PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error(
      `JWT_SECRET is set to a known placeholder value. Generate a strong secret (e.g. openssl rand -base64 48) before starting in production.`,
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production (got ${secret.length}). Refusing to start.`,
    );
  }
  return secret;
}
