import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum PaymentFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Entity({ name: 'recurring_payments', schema: 'finance' })
export class RecurringPayment extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'UAH' })
  currency: string;

  @Column({ name: 'category_id', type: 'varchar', nullable: true })
  categoryId: string | null;

  @Column({ type: 'enum', enum: PaymentFrequency })
  frequency: PaymentFrequency;

  @Column({ name: 'next_due_date', type: 'date' })
  nextDueDate: string;

  @Column({ name: 'account_id', type: 'varchar', nullable: true })
  accountId: string | null;
}
