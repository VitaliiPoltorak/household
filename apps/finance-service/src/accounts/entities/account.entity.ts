import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum AccountType {
  CASH = 'cash',
  BANK = 'bank',
  CRYPTO = 'crypto',
  INVESTMENT = 'investment',
  DEPOSIT = 'deposit',
}

@Entity({ name: 'accounts', schema: 'finance' })
export class Account extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ length: 3, default: 'UAH' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'external_id', nullable: true })
  externalId: string | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;
}
