import { describe, expect, it } from 'vitest';
import type { Category } from '../api/types';
import {
  describeImpact,
  groupCategories,
  impactTotal,
  parentOptions,
} from './categories';

const cat = (over: Partial<Category> & { id: string }): Category => ({
  householdId: 'h',
  name: over.id,
  type: 'expense',
  icon: null,
  parentId: null,
  isArchived: false,
  ...over,
});

describe('groupCategories', () => {
  const all = [
    cat({ id: 'salary', type: 'income' }),
    cat({ id: 'food' }),
    cat({ id: 'old', isArchived: true }),
  ];
  it('puts expense before income and omits archived rows', () => {
    const { sections } = groupCategories(all);
    expect(sections.map((s) => s.type)).toEqual(['expense', 'income']);
    expect(sections[0]!.data.map((c) => c.id)).toEqual(['food']);
  });
  it('returns archived categories separately', () => {
    expect(groupCategories(all).archived.map((c) => c.id)).toEqual(['old']);
  });
  it('drops empty sections', () => {
    expect(groupCategories([cat({ id: 'a' })]).sections).toHaveLength(1);
  });
});

describe('parentOptions', () => {
  const all = [
    cat({ id: 'food' }),
    cat({ id: 'snacks', parentId: 'food' }),
    cat({ id: 'salary', type: 'income' }),
    cat({ id: 'old', isArchived: true }),
  ];
  it('offers only active top-level categories of the same type', () => {
    expect(parentOptions(all, 'expense').map((c) => c.id)).toEqual(['food']);
  });
  it('excludes the category being edited', () => {
    expect(parentOptions(all, 'expense', 'food')).toEqual([]);
  });
});

describe('impact helpers', () => {
  const impact = {
    categoryId: 'c',
    transactions: 3,
    recurringPayments: 0,
    subcategories: 1,
    lastUsedAt: null,
  };
  it('sums every dependent kind', () => {
    expect(impactTotal(impact)).toBe(4);
  });
  it('describes only the non-zero kinds', () => {
    expect(describeImpact(impact)).toBe('3 transactions, 1 sub-categories');
  });
});
