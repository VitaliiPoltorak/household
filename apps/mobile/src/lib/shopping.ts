import type { ShoppingListItem } from '../api/types';

/** Backend floor for an item name (#200). */
export const MIN_ITEM_NAME = 3;

/**
 * Splits pasted text on commas / newlines, trims, drops names under the
 * 3-char floor, and dedupes case-insensitively both within the text and
 * against names already on the list. Mirrors parseBulkNames in apps/web.
 */
export function parseBulkNames(raw: string, existingNames: string[]): string[] {
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of raw.split(/[,\n]/)) {
    const name = token.trim();
    if (name.length < MIN_ITEM_NAME) continue;
    const lower = name.toLowerCase();
    if (existing.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    result.push(name);
  }
  return result;
}

/** Items still to buy first, bought ones after; each group keeps server order. */
export function sortItems(items: ShoppingListItem[]): ShoppingListItem[] {
  return [...items.filter((i) => !i.isPurchased), ...items.filter((i) => i.isPurchased)];
}

export function progress(items: ShoppingListItem[]): {
  done: number;
  total: number;
} {
  return { done: items.filter((i) => i.isPurchased).length, total: items.length };
}

/** "2 kg", "3", or "" when the quantity is the default 1 with no unit. */
export function formatQuantity(item: ShoppingListItem): string {
  const q = Number(item.quantity);
  if (q === 1 && !item.unit) return '';
  return [Number.isFinite(q) ? String(q) : '', item.unit ?? '']
    .filter(Boolean)
    .join(' ');
}
