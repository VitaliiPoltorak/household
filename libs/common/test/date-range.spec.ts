import { nextDayIso } from '../src/date/date-range';

describe('nextDayIso', () => {
  it('advances one day forward within a month', () => {
    expect(nextDayIso('2026-07-30')).toBe('2026-07-31');
  });

  it('handles month rollover', () => {
    expect(nextDayIso('2026-07-31')).toBe('2026-08-01');
  });

  it('handles year rollover', () => {
    expect(nextDayIso('2027-12-31')).toBe('2028-01-01');
  });

  it('handles February 28 in a non-leap year', () => {
    expect(nextDayIso('2026-02-28')).toBe('2026-03-01');
  });

  it('handles February 28 in a leap year (2028)', () => {
    expect(nextDayIso('2028-02-28')).toBe('2028-02-29');
    expect(nextDayIso('2028-02-29')).toBe('2028-03-01');
  });

  it('throws on invalid input', () => {
    expect(() => nextDayIso('not-a-date')).toThrow(/invalid date/i);
  });
});
