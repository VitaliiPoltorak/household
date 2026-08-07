import { NotFoundException } from '@nestjs/common';
import { IOAuthStrategy } from '../src/auth/strategies/oauth-strategy.interface';
import { OAuthStrategyRegistry } from '../src/auth/strategies/oauth-strategy.registry';
import { OAuthProfile } from '../src/users/users.service';

// Minimal fake strategies — the registry only reads `provider` and (indirectly)
// forwards `validate` calls. No real OAuth I/O required.
const fakeProfile = (provider: string): OAuthProfile => ({
  provider,
  providerUserId: 'sub-123',
  email: `user@${provider}.test`,
  displayName: 'Fake User',
});

const makeStrategy = (provider: string): IOAuthStrategy => ({
  provider,
  validate: jest.fn().mockResolvedValue(fakeProfile(provider)),
});

describe('OAuthStrategyRegistry', () => {
  it('returns the correct strategy for a known provider name', async () => {
    const google = makeStrategy('google');
    const apple = makeStrategy('apple');
    const registry = new OAuthStrategyRegistry([google, apple]);

    expect(registry.get('google')).toBe(google);
    expect(registry.get('apple')).toBe(apple);

    // Forwarded call still hits the underlying strategy instance.
    await registry.get('google').validate('token-abc');
    expect(google.validate).toHaveBeenCalledWith('token-abc');
  });

  it('throws NotFoundException with a helpful message for an unknown provider', () => {
    const registry = new OAuthStrategyRegistry([makeStrategy('google')]);

    expect(() => registry.get('linkedin')).toThrow(NotFoundException);
    expect(() => registry.get('linkedin')).toThrow(
      /Unknown OAuth provider: linkedin/,
    );
  });

  it('list() returns all registered provider names', () => {
    const registry = new OAuthStrategyRegistry([
      makeStrategy('google'),
      makeStrategy('apple'),
      makeStrategy('facebook'),
    ]);

    expect(registry.list()).toEqual(['google', 'apple', 'facebook']);
  });

  it('handles an empty strategy list', () => {
    const registry = new OAuthStrategyRegistry([]);

    expect(registry.list()).toEqual([]);
    expect(() => registry.get('google')).toThrow(NotFoundException);
  });
});
