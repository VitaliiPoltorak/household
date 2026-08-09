import { Account } from '../src/accounts/entities/account.entity';
import {
  Transaction,
  TransactionType,
  TransferDirection,
} from '../src/transactions/entities/transaction.entity';

/**
 * Unit tests for the domain methods added in #90 (GRASP Information Expert).
 * These methods are pure — no DB, no DI — so they belong in isolated unit
 * tests, not the integration suite.
 */

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  const tx = new Transaction();
  Object.assign(tx, {
    type: TransactionType.INCOME,
    amount: 100 as unknown as number,
    accountId: 'acc-1',
    transferDirection: null,
    transferPairId: null,
    ...overrides,
  });
  return tx;
}

function makeAccount(balance: number): Account {
  const acc = new Account();
  // pg driver returns decimal columns as strings; simulate that.
  acc.balance = String(balance) as unknown as number;
  return acc;
}

describe('Transaction.computeDelta (static)', () => {
  it('income → +amount', () => {
    expect(Transaction.computeDelta(TransactionType.INCOME, 250)).toBe(250);
  });

  it('expense → -amount', () => {
    expect(Transaction.computeDelta(TransactionType.EXPENSE, 250)).toBe(-250);
  });

  it('adjustment → +amount (caller passes signed delta)', () => {
    expect(Transaction.computeDelta(TransactionType.ADJUSTMENT, -50)).toBe(-50);
    expect(Transaction.computeDelta(TransactionType.ADJUSTMENT, 50)).toBe(50);
  });

  it('transfer → 0 (delta handled per leg elsewhere)', () => {
    expect(Transaction.computeDelta(TransactionType.TRANSFER, 999)).toBe(0);
  });
});

describe('Transaction.getDelta / getReverseDelta (instance)', () => {
  it('delegates to computeDelta with entity fields', () => {
    const income = makeTx({ type: TransactionType.INCOME, amount: 500 as unknown as number });
    expect(income.getDelta()).toBe(500);
    expect(income.getReverseDelta()).toBe(-500);
  });

  it('handles amount stored as string (pg decimal quirk)', () => {
    const tx = makeTx({ amount: '123.45' as unknown as number, type: TransactionType.EXPENSE });
    expect(tx.getDelta()).toBeCloseTo(-123.45);
  });
});

describe('Transaction.isTransferLeg', () => {
  it('true for TRANSFER type', () => {
    expect(makeTx({ type: TransactionType.TRANSFER }).isTransferLeg()).toBe(true);
  });

  it('false for every other type', () => {
    for (const type of [TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.ADJUSTMENT]) {
      expect(makeTx({ type }).isTransferLeg()).toBe(false);
    }
  });
});

describe('Transaction.getTransferLegSignedAmount', () => {
  it('debit leg → -amount', () => {
    const leg = makeTx({
      type: TransactionType.TRANSFER,
      amount: 300 as unknown as number,
      transferDirection: TransferDirection.DEBIT,
    });
    expect(leg.getTransferLegSignedAmount()).toBe(-300);
  });

  it('credit leg → +amount', () => {
    const leg = makeTx({
      type: TransactionType.TRANSFER,
      amount: 300 as unknown as number,
      transferDirection: TransferDirection.CREDIT,
    });
    expect(leg.getTransferLegSignedAmount()).toBe(300);
  });

  it('returns null for a transfer leg with no direction (legacy row)', () => {
    const leg = makeTx({
      type: TransactionType.TRANSFER,
      amount: 300 as unknown as number,
      transferDirection: null,
    });
    // Caller must fall back to insertion-order rule (see removePair).
    expect(leg.getTransferLegSignedAmount()).toBeNull();
  });

  it('returns null for non-transfer transactions', () => {
    expect(makeTx({ type: TransactionType.INCOME }).getTransferLegSignedAmount()).toBeNull();
  });
});

describe('Account.canWithdraw', () => {
  it('true when balance exceeds amount', () => {
    expect(makeAccount(500).canWithdraw(100)).toBe(true);
  });

  it('true when balance exactly equals amount', () => {
    expect(makeAccount(100).canWithdraw(100)).toBe(true);
  });

  it('false when balance falls short', () => {
    expect(makeAccount(50).canWithdraw(100)).toBe(false);
  });

  it('handles balance stored as string (pg decimal quirk)', () => {
    // pg returns decimal as string — canWithdraw must coerce.
    const acc = makeAccount(0);
    acc.balance = '123.45' as unknown as number;
    expect(acc.canWithdraw(100)).toBe(true);
    expect(acc.canWithdraw(200)).toBe(false);
  });
});
