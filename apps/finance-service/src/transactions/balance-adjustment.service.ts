import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { Transaction, TransactionType } from './entities/transaction.entity';

/**
 * Applies a Transaction's balance delta to an account and delegates the
 * actual mutation to {@link AccountsService.adjustBalance}.
 *
 * Delta rules live on the Transaction entity (see {@link Transaction.getDelta}
 * and {@link Transaction.computeDelta}). This service is a thin coordinator —
 * it decides WHEN to touch the balance, the entity decides BY HOW MUCH.
 *
 * Never opens its own DB transaction: always accepts the caller's optional
 * {@link EntityManager} so the transactional boundary stays with the
 * orchestrator (TransactionsService / TransferDomainService).
 */
@Injectable()
export class BalanceAdjustmentService {
  constructor(private readonly accountsService: AccountsService) {}

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
    const delta = Transaction.computeDelta(type, amount);
    if (delta === 0) return;
    await this.accountsService.adjustBalance(accountId, delta, manager);
  }

  /** Reverse a stored transaction's effect on its account. */
  async reverse(tx: Transaction, manager?: EntityManager): Promise<void> {
    const delta = tx.getReverseDelta();
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
    const reverse = -Transaction.computeDelta(oldType, oldAmount);
    if (reverse !== 0) {
      await this.accountsService.adjustBalance(accountId, reverse, manager);
    }
    const apply = Transaction.computeDelta(newType, newAmount);
    if (apply !== 0) {
      await this.accountsService.adjustBalance(accountId, apply, manager);
    }
  }
}
