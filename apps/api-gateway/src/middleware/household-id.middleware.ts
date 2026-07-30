import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/request';

const SKIP_PREFIXES = ['/api/v1/health', '/api/v1/auth', '/api/docs'];

@Injectable()
export class HouseholdIdMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const shouldSkip = SKIP_PREFIXES.some((p) => req.originalUrl.startsWith(p));
    if (!shouldSkip) {
      req.householdId = req.headers['x-household-id'] as string | undefined;
    }
    next();
  }
}
