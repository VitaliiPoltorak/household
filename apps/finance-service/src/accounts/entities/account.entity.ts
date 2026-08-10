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

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  // ─────────────────────────────────────────────────────────────────────
  // Domain methods (Info Expert per #90). Balance is a decimal column and
  // pg returns it as a string; convert at the boundary. Not currently used
  // by any call site — an overdraft-check hook other services can adopt.
  // ─────────────────────────────────────────────────────────────────────

  /** True if this account can cover a withdrawal of `amount` in its currency. */
  canWithdraw(amount: number): boolean {
    return Number(this.balance) >= amount;
  }
}
