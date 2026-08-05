import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { KafkaProducerService } from '@household/kafka';
import { AccountsService } from '../accounts/accounts.service';
import { Transaction, TransactionType } from './entities/transaction.entity';
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
    const transaction = await this.repo.save(
      this.repo.create({ ...dto, householdId, createdBy: userId, transferPairId: null }),
    );

    const delta = dto.type === TransactionType.EXPENSE ? -dto.amount : dto.amount;
    await this.accountsService.adjustBalance(dto.accountId, delta);

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

    const debit = await this.repo.save(
      this.repo.create({
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
      }),
    );

    const credit = await this.repo.save(
      this.repo.create({
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
      }),
    );

    await this.accountsService.adjustBalance(dto.fromAccountId, -dto.amount);
    await this.accountsService.adjustBalance(dto.toAccountId, dto.amount);

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

    const newAmount = dto.amount ?? Number(existing.amount);
    const newType   = dto.type   ?? existing.type;

    // Recalculate balance when amount or type changes (skip for transfers — both legs must stay in sync)
    if (existing.type !== TransactionType.TRANSFER && (dto.amount !== undefined || dto.type !== undefined)) {
      // Reverse old effect
      const oldDelta = existing.type === TransactionType.EXPENSE
        ? Number(existing.amount)
        : -Number(existing.amount);
      await this.accountsService.adjustBalance(existing.accountId, oldDelta);

      // Apply new effect
      const newDelta = newType === TransactionType.EXPENSE ? -newAmount : newAmount;
      await this.accountsService.adjustBalance(existing.accountId, newDelta);
    }

    await this.repo.update(id, {
      type: newType,
      amount: newAmount,
      description: dto.description,
      date: dto.date,
      categoryId: dto.categoryId,
      incomeSourceId: dto.incomeSourceId,
    });

    const updated = await this.findOne(id, householdId);
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

    const transaction = await this.repo.save(
      this.repo.create({
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
      }),
    );

    await this.accountsService.adjustBalance(accountId, delta);

    await this.kafka.emit(
      'finance.transaction.created',
      { transactionId: transaction.id, householdId },
      { userId, householdId },
    );

    return transaction;
  }

  async remove(id: string, householdId: string): Promise<void> {
    const transaction = await this.findOne(id, householdId);

    let reverseDelta: number;
    if (transaction.type === TransactionType.EXPENSE) {
      reverseDelta = Number(transaction.amount);
    } else if (transaction.type === TransactionType.INCOME || transaction.type === TransactionType.ADJUSTMENT) {
      reverseDelta = -Number(transaction.amount);
    } else {
      reverseDelta = 0;
    }

    if (reverseDelta !== 0) {
      await this.accountsService.adjustBalance(transaction.accountId, reverseDelta);
    }

    await this.repo.delete(id);
  }
}
