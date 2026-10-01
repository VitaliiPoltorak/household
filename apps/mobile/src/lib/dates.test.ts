import { describe, expect, it } from 'vitest';
import { isIsoDate, todayIso } from './dates';

describe('isIsoDate', () => {
  it('accepts real dates', () => {
    expect(isIsoDate('2026-10-01')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });
  it('rejects malformed and impossible dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('01.10.2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('todayIso', () => {
  it('uses the local calendar date, zero-padded', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
