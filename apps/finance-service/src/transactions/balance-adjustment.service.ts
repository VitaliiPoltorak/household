import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { Transaction, TransactionType } from './entities/transaction.entity';

/**
 * Owns the single-account balance delta rules for a Transaction and delegates
 * the actual balance mutation to {@link AccountsService.adjustBalance}.
 *
 * Delta rules:
 *  - income     → +amount
 *  - adjustment → +amount (the caller passes a signed delta)
 *  - expense    → -amount
 *  - transfer   →  0      (transfers are two-account and go through
 *                          TransferDomainService, not this service)
 *
 * This service NEVER opens its own DB transaction. It always accepts the
 * caller's optional {@link EntityManager} so the transactional boundary
 * stays with the orchestrator (TransactionsService / TransferDomainService).
 */
@Injectable()
export class BalanceAdjustmentService {
  constructor(private readonly accountsService: AccountsService) {}

  /**
   * Signed delta a fresh transaction of the given type + amount should apply
   * to its account. Transfers return 0 — their balance movement is handled
   * per-leg in TransferDomainService.
   */
  computeDelta(type: TransactionType, amount: number): number {
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

  /** Delta needed to undo a previously-applied transaction. */
  reverseDelta(type: TransactionType, amount: number): number {
    return -this.computeDelta(type, amount);
  }

  /**
   * Apply the type/amount rule to `accountId`. No-op for transfers or when
   * the computed delta is zero.
   */
  async apply(
    accountId: string,
    type: TransactionType,
    amount: number,
    manager?: EntityManager,
  ): Promise<void> {
    const delta = this.computeDelta(type, amount);
    if (delta === 0) return;
    await this.accountsService.adjustBalance(accountId, delta, manager);
  }

  /** Reverse a stored transaction's effect on its account. */
  async reverse(tx: Transaction, manager?: EntityManager): Promise<void> {
    const delta = this.reverseDelta(tx.type, Number(tx.amount));
    if (delta === 0) return;
    await this.accountsService.adjustBalance(tx.accountId, delta, manager);
  }

  /**
   * Swap old→new for a single account in one shot (used by update()).
   * Runs the reverse of the old row then the apply of the new row.
   */
  async swap(
    accountId: string,
    oldType: TransactionType,
    oldAmount: number,
    newType: TransactionType,
    newAmount: number,
    manager?: EntityManager,
  ): Promise<void> {
    const reverse = this.reverseDelta(oldType, oldAmount);
    if (reverse !== 0) {
      await this.accountsService.adjustBalance(accountId, reverse, manager);
    }
    const apply = this.computeDelta(newType, newAmount);
    if (apply !== 0) {
      await this.accountsService.adjustBalance(accountId, apply, manager);
    }
  }
}
