import { isMobileClient } from '../src/auth/client-platform';

describe('isMobileClient (#356)', () => {
  it('returns true for "mobile"', () => {
    expect(isMobileClient('mobile')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isMobileClient('Mobile')).toBe(true);
    expect(isMobileClient('MOBILE')).toBe(true);
  });

  it('returns false for undefined (web default)', () => {
    expect(isMobileClient(undefined)).toBe(false);
  });

  it('returns false for any other value', () => {
    expect(isMobileClient('web')).toBe(false);
    expect(isMobileClient('')).toBe(false);
  });

  it('reads the first value when Express hands back an array', () => {
    expect(isMobileClient(['mobile', 'web'])).toBe(true);
    expect(isMobileClient(['web'])).toBe(false);
  });
});
