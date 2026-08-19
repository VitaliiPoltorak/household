import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '@household/common';

const PUBLIC_PATHS = [
  '/api/v1/health',
  '/api/docs',
  '/api/v1/auth/google',
  '/api/v1/auth/apple',
  '/api/v1/auth/facebook',
  '/api/v1/auth/oauth',   // canonical /auth/oauth/:provider
  '/api/v1/auth/refresh', // cookie-authenticated after #60
  '/api/v1/auth/logout',  // cookie-authenticated after #60
  // Manual email/password flow — none of these can carry a JWT yet:
  '/api/v1/auth/register',
  '/api/v1/auth/verify-email',      // covers /verify-email and /verify-email/resend
  '/api/v1/auth/login',
  '/api/v1/auth/unlock',            // link-in-email flow after account soft-lock
  // NOTE: /api/v1/auth/logout-all is intentionally NOT here — it needs the
  // JWT so the gateway can populate X-User-Id for the auth service.
];

export function createJwtMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) {
      return next();
    }

    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Missing access token',
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
    }

    const [type, token] = auth.split(' ');
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Invalid authorization header',
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
    }

    try {
      (req as any).user = verifyJwt(token, secret);
    } catch {
      return res.status(401).json({
        statusCode: 401,
        message: 'Invalid or expired token',
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
    }

    next();
  };
}
