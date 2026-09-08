import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum CategoryType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

// Case-insensitive uniqueness (#325), same shape as accounts (#191): `name`
// keeps the user's chosen casing for display, `nameNormalized` is the
// lowercased comparison key. Scoped by `type` as well, so "Gifts" can exist
// as both an income and an expense category — those are different things.
// Partial index — only non-archived categories occupy the name, so a
// household can archive "Groceries" and later create a fresh one without
// renaming history.
//
// This index is also what makes seeding idempotent: seedDefaults() inserts
// with .orIgnore(), which needs a unique constraint to conflict against.
// Without it, an at-least-once redelivery of household.created would give the
// household a second full set of default categories.
@Index(
  'idx_categories_household_type_name_unique',
  ['householdId', 'type', 'nameNormalized'],
  {
    unique: true,
    where: '"is_archived" = false',
  },
)
@Entity({ name: 'transaction_categories', schema: 'finance' })
export class Category extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  // Nullable to match the accounts precedent and to keep the backfill in the
  // migration simple; CategoriesService always populates it on create/update.
  @Column({ name: 'name_normalized', type: 'varchar', nullable: true })
  nameNormalized: string | null;

  @Column({ type: 'enum', enum: CategoryType })
  type: CategoryType;

  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId: string | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;
}
