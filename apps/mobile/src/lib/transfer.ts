import type { CreateTransferInput } from '../api/finance';

// Amounts further than this from the market rate get a non-blocking warning
// (fees and spread are real); it only exists to catch typos. Same as web.
export const RATE_WARN_THRESHOLD = 0.05;

/** Parse a user-typed decimal ("12,5" or "12.5"); NaN when it isn't a number. */
export function parseAmount(text: string): number {
  const t = text.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
}

export function buildTransferPayload(input: {
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  /** Ignored for same-currency transfers: both legs carry fromAmount. */
  toAmount: number;
  description: string;
  date: string;
}): CreateTransferInput {
  const cross = input.fromCurrency !== input.toCurrency;
  return {
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    fromAmount: input.fromAmount,
    toAmount: cross ? input.toAmount : input.fromAmount,
    currency: input.fromCurrency,
    ...(cross ? { toCurrency: input.toCurrency } : {}),
    ...(input.description.trim()
      ? { description: input.description.trim() }
      : {}),
    date: input.date,
  };
}

/** Fraction by which the typed rate deviates from the market rate, or null if unknowable. */
export function rateDeviation(
  fromAmount: number,
  toAmount: number,
  marketRate: number | null,
): number | null {
  if (!marketRate || marketRate <= 0) return null;
  if (!Number.isFinite(fromAmount) || !Number.isFinite(toAmount)) return null;
  if (fromAmount <= 0) return null;
  return Math.abs(toAmount / fromAmount - marketRate) / marketRate;
}
