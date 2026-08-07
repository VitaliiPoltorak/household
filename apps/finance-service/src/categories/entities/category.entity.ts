import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum CategoryType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

@Entity({ name: 'transaction_categories', schema: 'finance' })
export class Category extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: CategoryType })
  type: CategoryType;

  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId: string | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;
}
