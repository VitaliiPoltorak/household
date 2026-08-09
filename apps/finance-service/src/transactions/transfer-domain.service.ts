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
          amount: dto.amount,
          currency: dto.currency ?? 'UAH',
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
          amount: dto.amount,
          currency: dto.currency ?? 'UAH',
          description: dto.description ?? null,
          date: dto.date,
          createdBy: userId,
          categoryId: null,
          incomeSourceId: null,
          transferPairId,
          transferDirection: TransferDirection.CREDIT,
        }),
      );

      await this.accountsService.adjustBalance(dto.fromAccountId, -dto.amount, manager);
      await this.accountsService.adjustBalance(dto.toAccountId, dto.amount, manager);

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
