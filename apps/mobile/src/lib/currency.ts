export type RateMap = Record<string, number>;

/**
 * Convert between currencies with a UAH-based rate map (rates[ccy] = UAH per
 * unit; UAH is implicitly 1). Returns null when a rate is missing — callers
 * must refuse to guess, never fall back to 1:1. Mirrors apps/web/src/lib/currency.ts.
 */
export function convert(
  amount: number,
  fromCcy: string,
  toCcy: string,
  rates: RateMap,
): number | null {
  if (fromCcy === toCcy) return amount;
  const fromRate = fromCcy === 'UAH' ? 1 : rates[fromCcy];
  const toRate = toCcy === 'UAH' ? 1 : rates[toCcy];
  if (!fromRate || !toRate) return null;
  return (amount * fromRate) / toRate;
}

/** `/rates/latest` rows → RateMap (buy rate, as on web). */
export function ratesFromRows(rows: { ccy: string; buy: string }[]): RateMap {
  const rates: RateMap = { UAH: 1 };
  for (const r of rows) {
    const n = parseFloat(r.buy);
    if (Number.isFinite(n) && n > 0) rates[r.ccy] = n;
  }
  return rates;
}
