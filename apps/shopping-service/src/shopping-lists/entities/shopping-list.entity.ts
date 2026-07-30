import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@household/database';
import { ShoppingListItem } from './shopping-list-item.entity';

export enum ListStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

@Entity({ name: 'shopping_lists', schema: 'shopping' })
export class ShoppingList extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ name: 'store_id', type: 'varchar', nullable: true })
  storeId: string | null;

  @Column({ type: 'enum', enum: ListStatus, default: ListStatus.ACTIVE })
  status: ListStatus;

  @Column({ name: 'created_by' })
  createdBy: string;

  @OneToMany(() => ShoppingListItem, (i) => i.list, { cascade: true, eager: true })
  items: ShoppingListItem[];
}
