import {
  getAccessTtlSeconds,
  getRefreshTtlSeconds,
  requireCoherentTokenTtls,
} from '@household/common';

function configWith(values: Record<string, unknown>): any {
  return {
    get: (key: string, def?: unknown) =>
      key in values ? values[key] : def,
  };
}

describe('token-ttl helpers', () => {
  describe('getAccessTtlSeconds', () => {
    it.each([
      ['30s', 30],
      ['15m', 900],
      ['1h', 3600],
      ['1d', 86400],
    ])('parses %s → %d seconds', (input, expected) => {
      expect(getAccessTtlSeconds(configWith({ JWT_ACCESS_EXPIRES: input }))).toBe(expected);
    });

    it('defaults to 15m when unset', () => {
      expect(getAccessTtlSeconds(configWith({}))).toBe(900);
    });

    it('throws on malformed value', () => {
      expect(() =>
        getAccessTtlSeconds(configWith({ JWT_ACCESS_EXPIRES: '15minutes' })),
      ).toThrow(/Invalid JWT_ACCESS_EXPIRES/);
    });
  });

  describe('getRefreshTtlSeconds', () => {
    it('converts days to seconds', () => {
      expect(getRefreshTtlSeconds(configWith({ JWT_REFRESH_EXPIRES_DAYS: 7 }))).toBe(
        7 * 86400,
      );
    });

    it('defaults to 30 days', () => {
      expect(getRefreshTtlSeconds(configWith({}))).toBe(30 * 86400);
    });

    it('throws on non-positive input', () => {
      expect(() =>
        getRefreshTtlSeconds(configWith({ JWT_REFRESH_EXPIRES_DAYS: 0 })),
      ).toThrow(/must be a positive number/);
    });
  });

  describe('requireCoherentTokenTtls', () => {
    it('returns both TTLs when refresh > access', () => {
      const ttls = requireCoherentTokenTtls(
        configWith({ JWT_ACCESS_EXPIRES: '15m', JWT_REFRESH_EXPIRES_DAYS: 30 }),
      );
      expect(ttls).toEqual({ accessTtl: 900, refreshTtl: 30 * 86400 });
    });

    it('throws when refresh <= access', () => {
      expect(() =>
        requireCoherentTokenTtls(
          configWith({ JWT_ACCESS_EXPIRES: '2d', JWT_REFRESH_EXPIRES_DAYS: 1 }),
        ),
      ).toThrow(/Refresh token TTL .* must exceed access token TTL/);
    });

    it('throws on equal TTLs (would immediately expire refresh alongside access)', () => {
      // 1 day access, 1 day refresh
      expect(() =>
        requireCoherentTokenTtls(
          configWith({ JWT_ACCESS_EXPIRES: '1d', JWT_REFRESH_EXPIRES_DAYS: 1 }),
        ),
      ).toThrow(/must exceed access token TTL/);
    });
  });
});
