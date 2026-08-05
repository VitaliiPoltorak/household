import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  TRANSFER = 'transfer',
  ADJUSTMENT = 'adjustment',
}

export enum TransferDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
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

  @Column({ name: 'category_id', type: 'varchar', nullable: true })
  categoryId: string | null;

  @Column({ name: 'income_source_id', type: 'varchar', nullable: true })
  incomeSourceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ name: 'transfer_pair_id', type: 'varchar', nullable: true })
  transferPairId: string | null;

  @Column({
    name: 'transfer_direction',
    type: 'enum',
    enum: TransferDirection,
    nullable: true,
  })
  transferDirection: TransferDirection | null;
}
