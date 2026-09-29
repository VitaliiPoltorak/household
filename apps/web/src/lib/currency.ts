// ──────────────────────────────────────────────
// Pure multi-currency conversion primitive, shared by anything that needs to
// convert a money amount without pulling in React (unlike hooks/useRates.ts,
// which owns fetching + caching the rates and re-exports `convert`/`RateMap`
// from here for its existing callers).
// ──────────────────────────────────────────────

export type RateMap = Record<string, number>;

// Convert amount in fromCcy to toCcy using a UAH-based rate map (rates[ccy] =
// how many UAH one unit of ccy buys; UAH itself is implicitly 1). Returns
// null if any required currency is missing — callers MUST check and refuse
// to show a total in that case, rather than falling back to a silent 1:1
// substitution.
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
  const fromUAH = amount * fromRate;
  return fromUAH / toRate;
}
