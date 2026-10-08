import type { Category, CategoryImpact } from '../api/types';

export interface CategorySection {
  type: 'expense' | 'income';
  title: string;
  data: Category[];
}

/** Active categories grouped expense-first (as on web), plus the archived rest. */
export function groupCategories(all: Category[]): {
  sections: CategorySection[];
  archived: Category[];
} {
  const active = all.filter((c) => !c.isArchived);
  const sections: CategorySection[] = [
    { type: 'expense', title: 'Expense', data: [] },
    { type: 'income', title: 'Income', data: [] },
  ];
  for (const c of active) {
    sections.find((s) => s.type === c.type)?.data.push(c);
  }
  return {
    sections: sections.filter((s) => s.data.length > 0),
    archived: all.filter((c) => c.isArchived),
  };
}

/**
 * Valid parents for a category of `type`: active, same type, not itself, and
 * not already a sub-category (the tree is one level deep).
 */
export function parentOptions(
  all: Category[],
  type: 'income' | 'expense',
  selfId?: string,
): Category[] {
  return all.filter(
    (c) =>
      !c.isArchived && c.type === type && c.id !== selfId && c.parentId === null,
  );
}

export function impactTotal(i: CategoryImpact): number {
  return i.transactions + i.recurringPayments + i.subcategories;
}

/** Human-readable list of what still references the category. */
export function describeImpact(i: CategoryImpact): string {
  const parts: string[] = [];
  if (i.transactions) parts.push(`${i.transactions} transactions`);
  if (i.recurringPayments) parts.push(`${i.recurringPayments} recurring payments`);
  if (i.subcategories) parts.push(`${i.subcategories} sub-categories`);
  return parts.join(', ');
}
