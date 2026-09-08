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
   *
   * Overdraft-guarded by default (#326) — an expense that would take the
   * account below zero is refused. `allowOverdraft` exists for the correction
   * paths; see createAdjustment in TransactionsService for the only caller
   * that sets it and why.
   */
  async apply(
    accountId: string,
    type: TransactionType,
    amount: number,
    manager?: EntityManager,
    opts: { allowOverdraft?: boolean } = {},
  ): Promise<void> {
    const delta = Transaction.computeDelta(type, amount);
    if (delta === 0) return;
    await this.accountsService.adjustBalance(accountId, delta, manager, opts);
  }

  /**
   * Reverse a stored transaction's effect on its account.
   *
   * Never overdraft-guarded (#326). Undoing an income that had lifted an
   * account out of the red legitimately puts it back there, and refusing that
   * would make an already-booked row impossible to delete — the guard would
   * turn a mistake into a permanent one. The guard's job is to stop bad money
   * going out, not to trap records in the ledger.
   */
  async reverse(tx: Transaction, manager?: EntityManager): Promise<void> {
    const delta = tx.getReverseDelta();
    if (delta === 0) return;
    await this.accountsService.adjustBalance(tx.accountId, delta, manager, {
      allowOverdraft: true,
    });
  }

  /**
   * Swap old→new for a single account in one shot (used by update()).
   * Runs the reverse of the old row then the apply of the new row.
   *
   * The order matters for the overdraft guard (#326), and it is the correct
   * one: undoing the old row first restores the balance to what it would be
   * had the transaction never existed, and the new row is then guarded against
   * THAT balance. So editing a $10 expense up to $10,000 is checked as if it
   * were a fresh $10,000 expense — which is exactly the edit path the issue
   * calls out, and it neither double-counts the original nor lets an edit
   * sneak past a check a create would have failed.
   *
   * The reverse half is unguarded for the same reason reverse() is.
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
      await this.accountsService.adjustBalance(accountId, reverse, manager, {
        allowOverdraft: true,
      });
    }
    const apply = Transaction.computeDelta(newType, newAmount);
    if (apply !== 0) {
      await this.accountsService.adjustBalance(accountId, apply, manager);
    }
  }
}
