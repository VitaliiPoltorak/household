import { ConfigService } from '@nestjs/config';

/**
 * Single source of truth for JWT lifetimes. AuthModule (signing) and
 * SessionsService (Redis TTL) must derive both values from the same helpers
 * so they can never drift into incoherent states like refresh < access.
 */

const DEFAULT_ACCESS = '15m';
const DEFAULT_REFRESH_DAYS = 30;

export function getAccessTtlSeconds(config: ConfigService): number {
  return parseExpiry(config.get<string>('JWT_ACCESS_EXPIRES', DEFAULT_ACCESS));
}

export function getRefreshTtlSeconds(config: ConfigService): number {
  const days = config.get<number>('JWT_REFRESH_EXPIRES_DAYS', DEFAULT_REFRESH_DAYS);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(
      `JWT_REFRESH_EXPIRES_DAYS must be a positive number (got ${days}).`,
    );
  }
  return Math.floor(days * 86400);
}

export interface TokenTtls {
  accessTtl: number;
  refreshTtl: number;
}

/**
 * Bootstrap-time helper. Returns both TTLs after checking the invariant
 * refresh > access. Called from AuthModule so the app refuses to start
 * with an incoherent pair (which would otherwise cause silent 401 loops
 * or dead sessions).
 */
export function requireCoherentTokenTtls(config: ConfigService): TokenTtls {
  const accessTtl = getAccessTtlSeconds(config);
  const refreshTtl = getRefreshTtlSeconds(config);
  if (refreshTtl <= accessTtl) {
    throw new Error(
      `Refresh token TTL (${refreshTtl}s) must exceed access token TTL (${accessTtl}s). ` +
        `Check JWT_ACCESS_EXPIRES and JWT_REFRESH_EXPIRES_DAYS.`,
    );
  }
  return { accessTtl, refreshTtl };
}

function parseExpiry(str: string): number {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(
      `Invalid JWT_ACCESS_EXPIRES: "${str}". Expected a value like "30s", "15m", "1h", "1d".`,
    );
  }
  const val = parseInt(match[1], 10);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers: Record<'s' | 'm' | 'h' | 'd', number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return val * multipliers[unit];
}
