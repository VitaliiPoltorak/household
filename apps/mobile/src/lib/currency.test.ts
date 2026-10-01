import { describe, expect, it } from 'vitest';
import { convert, ratesFromRows } from './currency';

const rates = ratesFromRows([
  { ccy: 'USD', buy: '40' },
  { ccy: 'EUR', buy: '44' },
  { ccy: 'BAD', buy: 'nope' },
]);

describe('convert', () => {
  it('is the identity for the same currency, even without rates', () => {
    expect(convert(10, 'USD', 'USD', {})).toBe(10);
  });
  it('converts via UAH', () => {
    expect(convert(100, 'USD', 'UAH', rates)).toBe(4000);
    expect(convert(4000, 'UAH', 'USD', rates)).toBe(100);
    expect(convert(44, 'EUR', 'USD', rates)).toBeCloseTo(48.4);
  });
  it('returns null instead of guessing when a rate is missing', () => {
    expect(convert(1, 'USD', 'PLN', rates)).toBeNull();
  });
  it('ignores unparseable rows', () => {
    expect(rates['BAD']).toBeUndefined();
    expect(rates['UAH']).toBe(1);
  });
});
