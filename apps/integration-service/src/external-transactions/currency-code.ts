// Monobank's statement API returns currency as an ISO 4217 *numeric* code
// (e.g. 980); finance-service's Transaction.currency is a 3-letter alpha
// code (e.g. "UAH"). Baseline table covering common currencies — extend as
// real accounts surface an unmapped code (fails closed via
// UnsupportedCurrencyError below rather than guessing).
const NUMERIC_TO_ALPHA3: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  985: 'PLN',
  756: 'CHF',
  203: 'CZK',
  578: 'NOK',
  752: 'SEK',
  124: 'CAD',
  392: 'JPY',
  36: 'AUD',
  949: 'TRY',
};

export function numericCurrencyToAlpha3(code: number): string | null {
  return NUMERIC_TO_ALPHA3[code] ?? null;
}
