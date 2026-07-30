import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment',
}

@Entity({ name: 'transactions', schema: 'finance' })
export class Transaction extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column({ name: 'account_id' })
  accountId: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'UAH' })
  currency: string;

  @Column({ name: 'category_id', nullable: true })
  categoryId: string | null;

  @Column({ name: 'income_source_id', nullable: true })
  incomeSourceId: string | null;

  @Column({ nullable: true })
  description: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'external_id', nullable: true })
  externalId: string | null;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ name: 'transfer_pair_id', nullable: true })
  transferPairId: string | null;
}
