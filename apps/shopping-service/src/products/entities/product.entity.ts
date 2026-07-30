import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

@Entity({ name: 'products', schema: 'shopping' })
export class Product extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ name: 'preferred_store_id', type: 'varchar', nullable: true })
  preferredStoreId: string | null;

  @Column({ name: 'alternative_store_ids', type: 'jsonb', default: '[]' })
  alternativeStoreIds: string[];

  @Column({ name: 'last_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  lastPrice: number | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;
}
