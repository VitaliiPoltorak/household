// ISO 4217 codes are exactly 3 uppercase A–Z letters. Anything else — junk
// from a stale record or manual DB edit — would throw inside Intl.NumberFormat
// and break the whole row. We fall back to bare number + code so the value is
// still readable, and warn in dev so the source of the bad data surfaces.
const ISO_4217 = /^[A-Z]{3}$/;

export function formatMoney(n: number, currency = 'UAH', locale = 'en-US'): string {
  const code = currency?.toUpperCase();
  if (!code || !ISO_4217.test(code)) {
    if (import.meta.env.DEV) {
      console.warn(`formatMoney: invalid currency code ${JSON.stringify(currency)}`);
    }
    return `${n.toFixed(2)} ${currency ?? ''}`.trim();
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}
