import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum StoreType {
  SUPERMARKET = 'supermarket',
  GREENGROCER = 'greengrocer',
  PHARMACY = 'pharmacy',
  OTHER = 'other',
}

@Entity({ name: 'stores', schema: 'shopping' })
export class Store extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: StoreType, default: StoreType.OTHER })
  type: StoreType;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;
}
