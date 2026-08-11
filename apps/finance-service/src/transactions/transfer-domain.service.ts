import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { AccountsService } from '../accounts/accounts.service';
import { Transaction, TransactionType, TransferDirection } from './entities/transaction.entity';
import { CreateTransferDto } from './dto/transaction.dto';

/**
 * Owns the two-leg transfer lifecycle: creating a matched debit/credit pair
 * atomically, reversing both accounts + deleting both legs atomically, and
 * emitting one Kafka event per leg.
 *
 * Deliberately does NOT depend on BalanceAdjustmentService — a transfer's
 * balance math is inherently symmetric across two accounts and doesn't map
 * to the single-account delta table BalanceAdjustmentService encapsulates.
 */
@Injectable()
export class TransferDomainService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async createPair(
    householdId: string,
    userId: string,
    dto: CreateTransferDto,
  ): Promise<[Transaction, Transaction]> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Source and destination accounts must differ');
    }

    // Resolve payload variants (#162): explicit two-leg amounts win, else
    // fall back to the legacy single `amount` shape for same-currency
    // transfers. Reject anything ambiguous with a 400 rather than silently
    // picking one side and drifting the ledger.
    const { fromAmount, toAmount, fromCurrency, toCurrency } = this.resolveAmounts(dto);

    // Verifies both accounts exist AND belong to the caller's household.
    // Throws NotFoundException otherwise — prevents cross-household transfers.
    await Promise.all([
      this.accountsService.findOne(dto.fromAccountId, householdId),
      this.accountsService.findOne(dto.toAccountId, householdId),
    ]);

    const transferPairId = randomUUID();

    const [debit, credit] = await this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);

      const debitLeg = await txRepo.save(
        txRepo.create({
          householdId,
          accountId: dto.fromAccountId,
          type: TransactionType.TRANSFER,
          amount: fromAmount,
          currency: fromCurrency,
          description: dto.description ?? null,
          date: dto.date,
          createdBy: userId,
          categoryId: null,
          incomeSourceId: null,
          transferPairId,
          transferDirection: TransferDirection.DEBIT,
        }),
      );

      const creditLeg = await txRepo.save(
        txRepo.create({
          householdId,
          accountId: dto.toAccountId,
          type: TransactionType.TRANSFER,
          amount: toAmount,
          currency: toCurrency,
          description: dto.description ?? null,
          date: dto.date,
          createdBy: userId,
          categoryId: null,
          incomeSourceId: null,
          transferPairId,
          transferDirection: TransferDirection.CREDIT,
        }),
      );

      // Each leg mutates ITS OWN account in ITS OWN currency — Account.balance
      // is denominated in the account's currency, and adjustBalance treats
      // delta as raw units of that currency. This is why cross-currency works
      // without a rate: the source account's UAH balance loses fromAmount UAH,
      // the destination account's USD balance gains toAmount USD. Whatever
      // effective rate the user chose is materialised as the ratio of the two
      // amounts on the two legs.
      await this.accountsService.adjustBalance(dto.fromAccountId, -fromAmount, manager);
      await this.accountsService.adjustBalance(dto.toAccountId, toAmount, manager);

      return [debitLeg, creditLeg] as const;
    });

    await this.events.emit(
      'finance.transaction.created',
      { transactionId: debit.id, householdId, transferPairId },
      { userId, householdId },
    );
    await this.events.emit(
      'finance.transaction.created',
      { transactionId: credit.id, householdId, transferPairId },
      { userId, householdId },
    );

    return [debit, credit];
  }

  /**
   * Normalises the (legacy vs #162) DTO variants into the exact per-leg
   * amounts + currencies the pair-writer needs.
   *
   *   - Preferred (#162): `fromAmount` + `toAmount` set explicitly.
   *     `toCurrency` optional, defaults to source `currency`.
   *   - Legacy: only `amount` set → both legs use it in the single `currency`.
   *
   * Deliberately strict: mixing (`amount` + `fromAmount`) or providing only
   * one of (`fromAmount`, `toAmount`) is rejected. Silently dropping half the
   * inputs would let a client accidentally write a lopsided ledger.
   */
  private resolveAmounts(dto: CreateTransferDto): {
    fromAmount: number;
    toAmount: number;
    fromCurrency: string;
    toCurrency: string;
  } {
    const hasExplicit = dto.fromAmount !== undefined || dto.toAmount !== undefined;
    const hasLegacy = dto.amount !== undefined;

    if (hasExplicit && hasLegacy) {
      throw new BadRequestException(
        'Provide either { amount } (legacy) or { fromAmount, toAmount } — not both',
      );
    }

    if (hasExplicit) {
      if (dto.fromAmount === undefined || dto.toAmount === undefined) {
        throw new BadRequestException(
          'Both fromAmount and toAmount are required for cross-currency transfers',
        );
      }
      const fromCurrency = dto.currency ?? 'UAH';
      const toCurrency = dto.toCurrency ?? fromCurrency;
      return {
        fromAmount: dto.fromAmount,
        toAmount: dto.toAmount,
        fromCurrency,
        toCurrency,
      };
    }

    if (hasLegacy) {
      // Legacy same-currency path: single amount, single currency.
      // Reject `toCurrency` here so callers can't sneak a cross-currency
      // rate through the single-amount shape.
      if (dto.toCurrency !== undefined && dto.toCurrency !== (dto.currency ?? 'UAH')) {
        throw new BadRequestException(
          'toCurrency requires explicit fromAmount + toAmount',
        );
      }
      const ccy = dto.currency ?? 'UAH';
      return {
        fromAmount: dto.amount!,
        toAmount: dto.amount!,
        fromCurrency: ccy,
        toCurrency: ccy,
      };
    }

    throw new BadRequestException('amount or (fromAmount + toAmount) is required');
  }

  /**
   * Reverses both accounts and deletes both legs of a transfer atomically.
   * Uses transferDirection when present; falls back to createdAt order for
   * pre-migration rows (older leg = debit, newer = credit).
   */
  async removePair(transferPairId: string, householdId: string): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const legs = await txRepo.find({
        where: { transferPairId, householdId },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      if (legs.length === 0) return;

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        // For rows with transferDirection set, use the entity method.
        // For legacy rows without direction, fall back to insertion order:
        // older leg = DEBIT (originally -amount), newer = CREDIT (+amount).
        const applied = leg.getTransferLegSignedAmount()
          ?? (i === 0 ? -Number(leg.amount) : Number(leg.amount));
        await this.accountsService.adjustBalance(leg.accountId, -applied, manager);
      }

      await txRepo.delete({ transferPairId });
    });
  }
}
