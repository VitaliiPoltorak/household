import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { ShoppingList } from './shopping-list.entity';

@Entity({ name: 'shopping_list_items', schema: 'shopping' })
export class ShoppingListItem extends BaseEntity {
  @Column({ name: 'list_id' })
  listId: string;

  @Column({ name: 'product_id', type: 'varchar', nullable: true })
  productId: string | null;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  quantity: number;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ name: 'preferred_store_id', type: 'varchar', nullable: true })
  preferredStoreId: string | null;

  @Column({ name: 'actual_store_id', type: 'varchar', nullable: true })
  actualStoreId: string | null;

  @Column({ name: 'is_purchased', default: false })
  isPurchased: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number | null;

  @ManyToOne(() => ShoppingList, (l) => l.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'list_id' })
  list: ShoppingList;
}
