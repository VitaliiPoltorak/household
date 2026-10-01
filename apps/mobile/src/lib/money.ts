const ISO_4217 = /^[A-Z]{3}$/;

/** Format an amount for display; falls back to "12.00 XXX" for unknown codes. */
export function formatMoney(n: number, currency = 'UAH', locale = 'en-US') {
  const code = currency.toUpperCase();
  if (!ISO_4217.test(code)) return `${n.toFixed(2)} ${currency}`.trim();
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
