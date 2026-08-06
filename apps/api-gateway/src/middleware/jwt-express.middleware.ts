import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '@household/common';

const PUBLIC_PATHS = [
  '/api/v1/health',
  '/api/docs',
  '/api/v1/auth/google',
  '/api/v1/auth/apple',
  '/api/v1/auth/facebook',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
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
