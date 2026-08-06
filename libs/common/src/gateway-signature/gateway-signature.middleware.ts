import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from './gateway-signature';

export const TRUST_HEADERS = ['x-user-id', 'x-household-id', 'x-user-email'] as const;

/**
 * Express-style middleware that verifies requests carrying trust headers
 * (X-User-Id, X-Household-Id, X-User-Email) were signed by the api-gateway.
 * Requests with NO trust headers pass through — they are unauthenticated
 * (e.g. POST /auth/google).
 *
 * Behavior when GATEWAY_SIGNING_SECRET is unset:
 * - development / test: skip verification with a one-time warning.
 * - production: throws at bootstrap via requireSigningSecret() so we can
 *   never ship the dev-mode bypass to prod by accident.
 */
export function createGatewaySignatureMiddleware(
  config: ConfigService,
): (req: Request, res: Response, next: NextFunction) => void {
  const logger = new Logger('GatewaySignature');
  const secret = config.get<string>('GATEWAY_SIGNING_SECRET');
  let warned = false;

  return (req, res, next) => {
    if (!secret) {
      if (!warned) {
        logger.warn(
          'GATEWAY_SIGNING_SECRET is not set — trust headers are NOT verified. Do not run this way in production.',
        );
        warned = true;
      }
      return next();
    }

    const hasTrustHeader = TRUST_HEADERS.some((h) => req.headers[h] !== undefined);
    if (!hasTrustHeader) return next(); // public / unauth request

    const result = verifySignature(
      {
        userId: firstHeader(req.headers['x-user-id']),
        householdId: firstHeader(req.headers['x-household-id']),
        email: firstHeader(req.headers['x-user-email']),
      },
      firstHeader(req.headers[SIGNATURE_HEADER]),
      firstHeader(req.headers[TIMESTAMP_HEADER]),
      secret,
    );

    if (!result.valid) {
      logger.warn(`Rejected request: ${result.reason} — ${req.method} ${req.url}`);
      res.status(401).json({
        statusCode: 401,
        message: 'Invalid gateway signature',
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Call this in each internal service's bootstrap. Fail-fast if
 * NODE_ENV=production and GATEWAY_SIGNING_SECRET is missing.
 */
export function requireSigningSecret(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;
  if (!config.get<string>('GATEWAY_SIGNING_SECRET')) {
    throw new Error(
      'GATEWAY_SIGNING_SECRET is required in production (NODE_ENV=production). Refusing to start.',
    );
  }
}

function firstHeader(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
