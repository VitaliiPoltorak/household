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

  // ─────────────────────────────────────────────────────────────────────
  // Domain methods (Info Expert per #90) — the rules that depend only on
  // Transaction fields live here, not in services. Amount is @Column
  // decimal, so pg returns it as a string; convert at the boundary.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Signed delta this transaction applies to its account's balance.
   *  income / adjustment → +amount
   *  expense             → -amount
   *  transfer            →  0     (transfer legs are two-account and
   *                                handled explicitly per leg in
   *                                TransferDomainService)
   */
  getDelta(): number {
    return Transaction.computeDelta(this.type, Number(this.amount));
  }

  getReverseDelta(): number {
    return -this.getDelta();
  }

  isTransferLeg(): boolean {
    return this.type === TransactionType.TRANSFER;
  }

  /**
   * Signed amount that WAS applied to this leg's account (debit = -amount,
   * credit = +amount). Returns null for non-transfers and for legacy rows
   * with no transferDirection — the caller must fall back (see
   * TransferDomainService.removePair for the fallback rule).
   */
  getTransferLegSignedAmount(): number | null {
    if (!this.isTransferLeg() || !this.transferDirection) return null;
    return this.transferDirection === TransferDirection.DEBIT
      ? -Number(this.amount)
      : Number(this.amount);
  }

  /**
   * Static form for pre-persistence flows (create / update) where we have
   * type + amount from a DTO but not yet an entity instance. Instance
   * method {@link getDelta} delegates here.
   */
  static computeDelta(type: TransactionType, amount: number): number {
    switch (type) {
      case TransactionType.INCOME:
      case TransactionType.ADJUSTMENT:
        return amount;
      case TransactionType.EXPENSE:
        return -amount;
      case TransactionType.TRANSFER:
        return 0;
    }
  }
}
