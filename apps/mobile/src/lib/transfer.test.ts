import { describe, expect, it } from 'vitest';
import { buildTransferPayload, parseAmount, rateDeviation } from './transfer';

const base = {
  fromAccountId: 'a',
  toAccountId: 'b',
  description: '  ',
  date: '2026-10-01',
};

describe('parseAmount', () => {
  it('accepts dot and comma decimals', () => {
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount(' 12,5 ')).toBe(12.5);
  });
  it('rejects junk and partial numbers', () => {
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('12abc')).toBeNaN();
    expect(parseAmount('1.2.3')).toBeNaN();
  });
});

describe('buildTransferPayload', () => {
  it('mirrors the amount on both legs for a same-currency transfer', () => {
    const p = buildTransferPayload({
      ...base,
      fromCurrency: 'UAH',
      toCurrency: 'UAH',
      fromAmount: 500,
      toAmount: 123, // stale value from a previous account pair must not leak
    });
    expect(p).toEqual({
      fromAccountId: 'a',
      toAccountId: 'b',
      fromAmount: 500,
      toAmount: 500,
      currency: 'UAH',
      date: '2026-10-01',
    });
  });
  it('sends both amounts and toCurrency for a cross-currency transfer', () => {
    const p = buildTransferPayload({
      ...base,
      description: ' rent ',
      fromCurrency: 'UAH',
      toCurrency: 'USD',
      fromAmount: 1000,
      toAmount: 24.2,
    });
    expect(p).toMatchObject({
      fromAmount: 1000,
      toAmount: 24.2,
      currency: 'UAH',
      toCurrency: 'USD',
      description: 'rent',
    });
  });
});

describe('rateDeviation', () => {
  it('is null without a market rate or a usable amount', () => {
    expect(rateDeviation(100, 2.5, null)).toBeNull();
    expect(rateDeviation(0, 2.5, 0.025)).toBeNull();
    expect(rateDeviation(NaN, 2.5, 0.025)).toBeNull();
  });
  it('measures the fractional distance from market', () => {
    expect(rateDeviation(1000, 25, 0.025)).toBeCloseTo(0);
    expect(rateDeviation(1000, 20, 0.025)).toBeCloseTo(0.2);
  });
});
