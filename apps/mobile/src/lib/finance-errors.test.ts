import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { asInsufficientFunds, financeErrorMessage } from './finance-errors';

describe('asInsufficientFunds', () => {
  it('recognises the guard by code, not status', () => {
    const err = new ApiError(
      409,
      { code: 'INSUFFICIENT_FUNDS', available: 22.65, currency: 'USD' },
      'x',
    );
    expect(asInsufficientFunds(err)).toEqual({
      available: 22.65,
      currency: 'USD',
    });
  });
  it('ignores other 409s such as duplicate names', () => {
    expect(asInsufficientFunds(new ApiError(409, {}, 'dup'))).toBeNull();
  });
  it('ignores non-API errors', () => {
    expect(asInsufficientFunds(new Error('boom'))).toBeNull();
  });
});

describe('financeErrorMessage', () => {
  it('names the balance for insufficient funds', () => {
    const err = new ApiError(
      409,
      { code: 'INSUFFICIENT_FUNDS', available: 5, currency: 'UAH' },
      'x',
    );
    expect(financeErrorMessage(err)).toContain('5 UAH');
  });
  it('treats a non-ApiError as a connectivity problem', () => {
    expect(
      financeErrorMessage(new TypeError('Network request failed')),
    ).toMatch(/connection/);
  });
});
