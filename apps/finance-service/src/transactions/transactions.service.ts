import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '@household/kafka';
import { AccountsService } from '../accounts/accounts.service';
import { Transaction, TransactionType, TransferDirection } from './entities/transaction.entity';
import { CreateTransactionDto, CreateTransferDto, UpdateTransactionDto } from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async create(householdId: string, userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    // Defence-in-depth. DTO already restricts via @IsEnum, but a transfer
    // created here would skip the paired-leg logic in createTransfer() and
    // leave the ledger in an unpaired state.
    if ((dto.type as TransactionType) === TransactionType.TRANSFER) {
      throw new BadRequestException(
        'Use POST /transactions/transfer to create transfers',
      );
    }

    const transaction = await this.repo.manager.transaction(async (manager) => {
      const saved = await manager.getRepository(Transaction).save(
        manager.getRepository(Transaction).create({
          ...dto,
          householdId,
          createdBy: userId,
          transferPairId: null,
          transferDirection: null,
        }),
      );
      const delta = dto.type === TransactionType.EXPENSE ? -dto.amount : dto.amount;
      await this.accountsService.adjustBalance(dto.accountId, delta, manager);
      return saved;
    });

    await this.kafka.emit(
      'finance.transaction.created',
      { transactionId: transaction.id, householdId },
      { userId, householdId },
    );

    return transaction;
  }

  async createTransfer(
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

    await this.kafka.emit(
      'finance.transaction.created',
      { transactionId: debit.id, householdId, transferPairId },
      { userId, householdId },
    );
    await this.kafka.emit(
      'finance.transaction.created',
      { transactionId: credit.id, householdId, transferPairId },
      { userId, householdId },
    );

    return [debit, credit];
  }

  findAll(
    householdId: string,
    query: { type?: TransactionType; accountId?: string; categoryId?: string; from?: string; to?: string },
  ): Promise<Transaction[]> {
    const where: Record<string, unknown> = { householdId };
    if (query.type) where['type'] = query.type;
    if (query.accountId) where['accountId'] = query.accountId;
    if (query.categoryId) where['categoryId'] = query.categoryId;

    const qb = this.repo.createQueryBuilder('t').where(where);

    if (query.from) qb.andWhere('t.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('t.date <= :to', { to: query.to });

    return qb.orderBy('t.date', 'DESC').getMany();
  }

  async findOne(id: string, householdId: string): Promise<Transaction> {
    const transaction = await this.repo.findOne({ where: { id, householdId } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async update(id: string, householdId: string, dto: UpdateTransactionDto): Promise<Transaction> {
    const existing = await this.findOne(id, householdId);

    if (dto.type !== undefined && (dto.type as TransactionType) === TransactionType.TRANSFER) {
      throw new BadRequestException(
        'Cannot change transaction type to transfer',
      );
    }
    if (existing.type === TransactionType.TRANSFER && dto.type !== undefined) {
      throw new BadRequestException(
        'Cannot change type of a transfer leg',
      );
    }

    const newAmount = dto.amount ?? Number(existing.amount);
    const newType = dto.type ?? existing.type;

    const updated = await this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);

      // Recalculate balance when amount or type changes (skip for transfers — both legs must stay in sync)
      if (existing.type !== TransactionType.TRANSFER && (dto.amount !== undefined || dto.type !== undefined)) {
        const oldDelta = existing.type === TransactionType.EXPENSE
          ? Number(existing.amount)
          : -Number(existing.amount);
        await this.accountsService.adjustBalance(existing.accountId, oldDelta, manager);

        const newDelta = newType === TransactionType.EXPENSE ? -newAmount : newAmount;
        await this.accountsService.adjustBalance(existing.accountId, newDelta, manager);
      }

      await txRepo.update(id, {
        type: newType,
        amount: newAmount,
        description: dto.description,
        date: dto.date,
        categoryId: dto.categoryId,
        incomeSourceId: dto.incomeSourceId,
      });

      return txRepo.findOneOrFail({ where: { id, householdId } });
    });

    await this.kafka.emit(
      'finance.transaction.updated',
      { transactionId: id, householdId },
      { householdId },
    );
    return updated;
  }

  async createAdjustment(
    householdId: string,
    userId: string,
    accountId: string,
    delta: number,
    description?: string,
    date?: string,
  ): Promise<Transaction> {
    const account = await this.accountsService.findOne(accountId, householdId);

    const transaction = await this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const saved = await txRepo.save(
        txRepo.create({
          householdId,
          accountId,
          type: TransactionType.ADJUSTMENT,
          amount: delta,
          currency: account.currency,
          description: description ?? 'Manual balance adjustment',
          date: date ?? new Date().toISOString().slice(0, 10),
          createdBy: userId,
          categoryId: null,
          incomeSourceId: null,
          transferPairId: null,
          transferDirection: null,
        }),
      );
      await this.accountsService.adjustBalance(accountId, delta, manager);
      return saved;
    });

    await this.kafka.emit(
      'finance.transaction.created',
      { transactionId: transaction.id, householdId },
      { userId, householdId },
    );

    return transaction;
  }

  async remove(id: string, householdId: string): Promise<void> {
    const transaction = await this.findOne(id, householdId);

    if (transaction.type === TransactionType.TRANSFER && transaction.transferPairId) {
      await this.removeTransferPair(transaction.transferPairId, householdId);
      return;
    }

    await this.repo.manager.transaction(async (manager) => {
      const reverseDelta =
        transaction.type === TransactionType.EXPENSE
          ? Number(transaction.amount)
          : transaction.type === TransactionType.INCOME || transaction.type === TransactionType.ADJUSTMENT
            ? -Number(transaction.amount)
            : 0;

      if (reverseDelta !== 0) {
        await this.accountsService.adjustBalance(transaction.accountId, reverseDelta, manager);
      }
      await manager.getRepository(Transaction).delete(id);
    });
  }

  /**
   * Reverses both accounts and deletes both legs of a transfer atomically.
   * Uses transferDirection when present; falls back to createdAt order for
   * pre-migration rows (older leg = debit, newer = credit).
   */
  private async removeTransferPair(transferPairId: string, householdId: string): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const legs = await txRepo.find({
        where: { transferPairId, householdId },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      if (legs.length === 0) return;

      const resolveDirection = (leg: Transaction, index: number): TransferDirection =>
        leg.transferDirection ?? (index === 0 ? TransferDirection.DEBIT : TransferDirection.CREDIT);

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const direction = resolveDirection(leg, i);
        // debit leg had -amount applied to its account → reverse with +amount
        // credit leg had +amount applied to its account → reverse with -amount
        const reverse = direction === TransferDirection.DEBIT ? Number(leg.amount) : -Number(leg.amount);
        await this.accountsService.adjustBalance(leg.accountId, reverse, manager);
      }

      await txRepo.delete({ transferPairId });
    });
  }
}
