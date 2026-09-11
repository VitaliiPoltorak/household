import { FEATURE_FLAGS } from '../src/feature-flags/registry';

/**
 * Lifecycle enforcement (see the `feature-flags` skill): every non-kill-switch
 * flag needs a future expiresAt, and any flag that has moved to 'beta' needs a
 * rolloutIssueUrl. This runs against the static registry, so it catches a
 * stale flag in CI with no DB required.
 */
describe('FEATURE_FLAGS registry', () => {
  const now = new Date();

  it('has no non-kill-switch flag past its expiresAt', () => {
    const expired = FEATURE_FLAGS.filter((f) => {
      if (f.status === 'kill-switch') return false;
      if (!f.expiresAt) return true; // missing expiresAt is itself a violation, caught below
      return new Date(f.expiresAt) < now;
    });
    expect(expired).toEqual([]);
  });

  it('requires expiresAt on every non-kill-switch flag', () => {
    const missingExpiry = FEATURE_FLAGS.filter(
      (f) => f.status !== 'kill-switch' && !f.expiresAt,
    );
    expect(missingExpiry).toEqual([]);
  });

  it('requires rolloutIssueUrl on every beta flag', () => {
    const missingRolloutIssue = FEATURE_FLAGS.filter(
      (f) => f.status === 'beta' && !f.rolloutIssueUrl,
    );
    expect(missingRolloutIssue).toEqual([]);
  });

  it('has unique flag keys', () => {
    const keys = FEATURE_FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
