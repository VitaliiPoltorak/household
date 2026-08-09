import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { OAuthStrategyRegistry } from '../src/auth/strategies/oauth-strategy.registry';

/**
 * Unit test for the logout-all endpoint added in #66.
 * The actual session deletion is covered by sessions.service.spec.ts;
 * this spec just verifies the wire-up and the header guard. Cookie-clearing
 * behaviour added in #60 is asserted here too.
 */

function makeController(logoutAll: jest.Mock): { controller: AuthController; cookie: jest.Mock } {
  const auth = { logoutAll } as unknown as AuthService;
  const registry = {} as unknown as OAuthStrategyRegistry;
  const config = {
    get: (key: string, fallback?: unknown) => {
      // Only the two keys the controller reads at construction time.
      if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 30;
      if (key === 'AUTH_COOKIE_SECURE') return 'false';
      return fallback;
    },
  } as unknown as ConfigService;
  const cookie = jest.fn();
  const controller = new AuthController(auth, registry, config);
  // Expose the cookie mock via a factory helper below.
  (controller as unknown as { __cookieMock: jest.Mock }).__cookieMock = cookie;
  return { controller, cookie };
}

function mockRes(cookie: jest.Mock): Response {
  return { cookie } as unknown as Response;
}

describe('AuthController.logoutAll (#66)', () => {
  it('delegates to AuthService.logoutAll with the userId from x-user-id header', async () => {
    const logoutAll = jest.fn().mockResolvedValue(undefined);
    const { controller, cookie } = makeController(logoutAll);

    await controller.logoutAll('user-42', mockRes(cookie));

    expect(logoutAll).toHaveBeenCalledWith('user-42');
  });

  it('throws 401 when x-user-id header is missing', async () => {
    const logoutAll = jest.fn().mockResolvedValue(undefined);
    const { controller, cookie } = makeController(logoutAll);

    await expect(controller.logoutAll(undefined as unknown as string, mockRes(cookie))).rejects.toThrow(
      new UnauthorizedException('Missing X-User-Id header'),
    );
    expect(logoutAll).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it('throws 401 when x-user-id header is empty string', async () => {
    const logoutAll = jest.fn().mockResolvedValue(undefined);
    const { controller, cookie } = makeController(logoutAll);

    await expect(controller.logoutAll('', mockRes(cookie))).rejects.toThrow(UnauthorizedException);
    expect(logoutAll).not.toHaveBeenCalled();
  });

  it('clears both auth cookies on success (#60)', async () => {
    const logoutAll = jest.fn().mockResolvedValue(undefined);
    const { controller, cookie } = makeController(logoutAll);

    await controller.logoutAll('user-1', mockRes(cookie));

    // Both refresh and csrf cookies are cleared.
    expect(cookie).toHaveBeenCalledWith('household_refresh', '', expect.objectContaining({ maxAge: 0 }));
    expect(cookie).toHaveBeenCalledWith('household_csrf', '', expect.objectContaining({ maxAge: 0 }));
  });
});
