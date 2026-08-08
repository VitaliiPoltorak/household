import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { OAuthStrategyRegistry } from '../src/auth/strategies/oauth-strategy.registry';

/**
 * Unit test for the logout-all endpoint added in #66.
 * The actual session deletion is covered by sessions.service.spec.ts;
 * this spec just verifies the wire-up and the header guard.
 */

describe('AuthController.logoutAll (#66)', () => {
  let logoutAll: jest.Mock;
  let controller: AuthController;

  beforeEach(() => {
    logoutAll = jest.fn().mockResolvedValue(undefined);
    const auth = { logoutAll } as unknown as AuthService;
    const registry = {} as unknown as OAuthStrategyRegistry;
    controller = new AuthController(auth, registry);
  });

  it('delegates to AuthService.logoutAll with the userId from x-user-id header', async () => {
    await controller.logoutAll('user-42');
    expect(logoutAll).toHaveBeenCalledWith('user-42');
  });

  it('throws 401 when x-user-id header is missing', async () => {
    await expect(controller.logoutAll(undefined as unknown as string)).rejects.toThrow(
      new UnauthorizedException('Missing X-User-Id header'),
    );
    expect(logoutAll).not.toHaveBeenCalled();
  });

  it('throws 401 when x-user-id header is empty string', async () => {
    await expect(controller.logoutAll('')).rejects.toThrow(UnauthorizedException);
    expect(logoutAll).not.toHaveBeenCalled();
  });
});
