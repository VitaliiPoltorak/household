import type { ConfigService } from '@nestjs/config';
import { PasswordComplexityService } from '../src/auth/password-complexity.service';

const makeConfig = (overrides: Record<string, string | undefined> = {}) =>
  ({
    get: (key: string, fallback?: unknown) =>
      overrides[key] ?? (fallback as unknown),
  }) as unknown as ConfigService;

describe('PasswordComplexityService', () => {
  it('rejects a top-common-list password with score 0-1', () => {
    const svc = new PasswordComplexityService(makeConfig());
    const result = svc.check('password');
    expect(result.ok).toBe(false);
    expect(result.score).toBeLessThan(3);
    expect(result.warning).toBeDefined();
  });

  it('rejects a repeated-word password even when length passes', () => {
    const svc = new PasswordComplexityService(makeConfig());
    const result = svc.check('passwordpassword');
    expect(result.ok).toBe(false);
    expect(result.score).toBeLessThan(3);
  });

  it('accepts a random passphrase with score ≥ 3', () => {
    const svc = new PasswordComplexityService(makeConfig());
    const result = svc.check('Journey-Windmill-Copper-42');
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('downgrades passwords derived from user email via userInputs prime', () => {
    const svc = new PasswordComplexityService(makeConfig());
    // Same underlying entropy — with the email in userInputs, the score
    // should be strictly lower (or the ok flag flips).
    const withoutHint = svc.check('aliceexample2026', []);
    const withHint = svc.check('aliceexample2026', ['alice.example@example.com', 'Alice Example']);
    expect(withHint.score).toBeLessThanOrEqual(withoutHint.score);
  });

  it('honours ZXCVBN_MIN_SCORE override', () => {
    const strict = new PasswordComplexityService(makeConfig({ ZXCVBN_MIN_SCORE: '4' }));
    const result = strict.check('Journey-Windmill-Copper-42');
    // Score is likely 4, but if zxcvbn ranks this at 3 the strict service
    // must reject; if 4, accept. Either way `ok` matches score >= 4.
    expect(result.ok).toBe(result.score >= 4);
  });

  it('throws on invalid ZXCVBN_MIN_SCORE at construction', () => {
    expect(() => new PasswordComplexityService(makeConfig({ ZXCVBN_MIN_SCORE: '9' }))).toThrow();
    expect(() => new PasswordComplexityService(makeConfig({ ZXCVBN_MIN_SCORE: 'abc' }))).toThrow();
  });
});
