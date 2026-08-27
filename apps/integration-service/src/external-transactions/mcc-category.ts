// Baseline MCC (Merchant Category Code) → category-name suggestion rules
// (#21). Deliberately a *suggestion* the caller can override, not an
// auto-applied mapping — miscategorizing money silently is worse than
// asking. Not exhaustive; extend as real transactions surface unmapped
// MCCs. Names are free text, matched against the household's own
// categories client-side (finance-service categories are per-household,
// not a fixed taxonomy this service can validate against).
const MCC_TO_CATEGORY: Record<number, string> = {
  5411: 'Groceries',
  5422: 'Groceries',
  5441: 'Groceries',
  5462: 'Groceries',
  5499: 'Groceries',
  5811: 'Restaurants',
  5812: 'Restaurants',
  5813: 'Restaurants',
  5814: 'Restaurants',
  4121: 'Transport',
  4111: 'Transport',
  4131: 'Transport',
  5541: 'Transport',
  5542: 'Transport',
  4784: 'Transport',
  4900: 'Utilities',
  4814: 'Utilities',
  4816: 'Utilities',
  5912: 'Health',
  8011: 'Health',
  8021: 'Health',
  8031: 'Health',
  8041: 'Health',
  8042: 'Health',
  8049: 'Health',
  8050: 'Health',
  8062: 'Health',
  8071: 'Health',
  5311: 'Shopping',
  5651: 'Shopping',
  5691: 'Shopping',
  5732: 'Shopping',
  5942: 'Shopping',
  5999: 'Shopping',
  7832: 'Entertainment',
  7841: 'Entertainment',
  7922: 'Entertainment',
  7996: 'Entertainment',
  7011: 'Travel',
  4511: 'Travel',
  6011: 'Cash',
  6010: 'Cash',
  4829: 'Transfers',
};

export function suggestCategoryName(mcc: number): string | null {
  return MCC_TO_CATEGORY[mcc] ?? null;
}
