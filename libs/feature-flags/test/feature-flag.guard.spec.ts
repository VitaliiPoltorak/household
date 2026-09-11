import { ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagGuard } from '../src/guard/feature-flag.guard';
import { FeatureFlagService } from '../src/feature-flag.service';

describe('FeatureFlagGuard', () => {
  function makeContext(headers: Record<string, string>) {
    return {
      getHandler: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as never;
  }

  it('allows the request through when the handler has no @RequireFeature metadata', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const flags = { isEnabled: jest.fn() } as unknown as FeatureFlagService;
    const guard = new FeatureFlagGuard(reflector, flags);

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('allows the request through when the flag resolves enabled', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue('monobank-integration'),
    } as unknown as Reflector;
    const flags = {
      isEnabled: jest.fn().mockResolvedValue(true),
    } as unknown as FeatureFlagService;
    const guard = new FeatureFlagGuard(reflector, flags);

    const result = await guard.canActivate(
      makeContext({ 'x-user-id': 'u1', 'x-household-id': 'h1' }),
    );

    expect(result).toBe(true);
    expect(flags.isEnabled).toHaveBeenCalledWith('monobank-integration', {
      userId: 'u1',
      householdId: 'h1',
    });
  });

  it('throws 503 when the flag resolves disabled', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue('monobank-integration'),
    } as unknown as Reflector;
    const flags = {
      isEnabled: jest.fn().mockResolvedValue(false),
    } as unknown as FeatureFlagService;
    const guard = new FeatureFlagGuard(reflector, flags);

    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
