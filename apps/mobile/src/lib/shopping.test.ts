import { describe, expect, it } from 'vitest';
import type { ShoppingListItem } from '../api/types';
import { formatQuantity, parseBulkNames, progress, sortItems } from './shopping';

const item = (over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem => ({
  listId: 'l',
  productId: null,
  name: over.id,
  quantity: 1,
  unit: null,
  preferredStoreId: null,
  actualStoreId: null,
  isPurchased: false,
  price: null,
  ...over,
});

describe('parseBulkNames', () => {
  it('splits on commas and newlines and trims', () => {
    expect(parseBulkNames('milk, bread\n eggs ', [])).toEqual([
      'milk',
      'bread',
      'eggs',
    ]);
  });
  it('drops names under 3 characters', () => {
    expect(parseBulkNames('ab, milk', [])).toEqual(['milk']);
  });
  it('dedupes case-insensitively within the text and against the list', () => {
    expect(parseBulkNames('Milk, milk, bread', ['BREAD'])).toEqual(['Milk']);
  });
});

describe('sortItems / progress', () => {
  const items = [
    item({ id: 'a', isPurchased: true }),
    item({ id: 'b' }),
    item({ id: 'c' }),
  ];
  it('puts unbought items first, keeping order within groups', () => {
    expect(sortItems(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
  it('counts purchased items', () => {
    expect(progress(items)).toEqual({ done: 1, total: 3 });
  });
});

describe('formatQuantity', () => {
  it('hides the default quantity', () => {
    expect(formatQuantity(item({ id: 'a' }))).toBe('');
  });
  it('shows quantity and unit, accepting string decimals', () => {
    expect(formatQuantity(item({ id: 'a', quantity: '2.00', unit: 'kg' }))).toBe('2 kg');
  });
  it('shows a unit even at quantity 1', () => {
    expect(formatQuantity(item({ id: 'a', unit: 'pack' }))).toBe('1 pack');
  });
});
