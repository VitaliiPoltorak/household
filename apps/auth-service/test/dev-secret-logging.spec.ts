import type { ConfigService } from '@nestjs/config';
import {
  requireNoDevSecretLoggingInProduction,
  shouldLogDevSecrets,
} from '../src/auth/dev-secret-logging';

const makeConfig = (overrides: Record<string, string | undefined> = {}) =>
  ({
    get: (key: string, fallback?: unknown) =>
      overrides[key] ?? (fallback as unknown),
  }) as unknown as ConfigService;

describe('shouldLogDevSecrets', () => {
  it('defaults to false when unset', () => {
    expect(shouldLogDevSecrets(makeConfig())).toBe(false);
  });

  it('is true only for the exact string "true"', () => {
    expect(
      shouldLogDevSecrets(makeConfig({ AUTH_DEV_LOG_SECRETS: 'true' })),
    ).toBe(true);
    expect(
      shouldLogDevSecrets(makeConfig({ AUTH_DEV_LOG_SECRETS: 'false' })),
    ).toBe(false);
    expect(
      shouldLogDevSecrets(makeConfig({ AUTH_DEV_LOG_SECRETS: 'yes' })),
    ).toBe(false);
  });
});

describe('requireNoDevSecretLoggingInProduction', () => {
  it('is a no-op outside production, regardless of the flag', () => {
    expect(() =>
      requireNoDevSecretLoggingInProduction(
        makeConfig({ NODE_ENV: 'development', AUTH_DEV_LOG_SECRETS: 'true' }),
      ),
    ).not.toThrow();
  });

  it('is a no-op in production when the flag is unset/false', () => {
    expect(() =>
      requireNoDevSecretLoggingInProduction(
        makeConfig({ NODE_ENV: 'production' }),
      ),
    ).not.toThrow();
    expect(() =>
      requireNoDevSecretLoggingInProduction(
        makeConfig({ NODE_ENV: 'production', AUTH_DEV_LOG_SECRETS: 'false' }),
      ),
    ).not.toThrow();
  });

  it('throws — refusing to start — when the flag is true in production', () => {
    expect(() =>
      requireNoDevSecretLoggingInProduction(
        makeConfig({ NODE_ENV: 'production', AUTH_DEV_LOG_SECRETS: 'true' }),
      ),
    ).toThrow(/AUTH_DEV_LOG_SECRETS/);
  });
});
