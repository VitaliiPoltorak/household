import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { AccountsService } from '../accounts/accounts.service';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto, CreateTransferDto, UpdateTransactionDto } from './dto/transaction.dto';
import { BalanceAdjustmentService } from './balance-adjustment.service';
import { TransferDomainService } from './transfer-domain.service';

/**
 * HTTP-facing orchestrator for the /transactions endpoints.
 *
 * Delegates single-account balance mutations to {@link BalanceAdjustmentService}
 * and two-leg transfer lifecycle to {@link TransferDomainService}. Owns only
 * the guards, event emission for single-row mutations, and query-shape logic.
 */
@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    private readonly balances: BalanceAdjustmentService,
    private readonly transfers: TransferDomainService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
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
      await this.balances.apply(dto.accountId, dto.type, dto.amount, manager);
      return saved;
    });

    await this.events.emit(
      'finance.transaction.created',
      { transactionId: transaction.id, householdId },
      { userId, householdId },
    );

    return transaction;
  }

  createTransfer(
    householdId: string,
    userId: string,
    dto: CreateTransferDto,
  ): Promise<[Transaction, Transaction]> {
    return this.transfers.createPair(householdId, userId, dto);
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
        await this.balances.swap(
          existing.accountId,
          existing.type,
          Number(existing.amount),
          newType,
          newAmount,
          manager,
        );
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

    await this.events.emit(
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
      await this.balances.apply(accountId, TransactionType.ADJUSTMENT, delta, manager);
      return saved;
    });

    await this.events.emit(
      'finance.transaction.created',
      { transactionId: transaction.id, householdId },
      { userId, householdId },
    );

    return transaction;
  }

  async remove(id: string, householdId: string): Promise<void> {
    const transaction = await this.findOne(id, householdId);

    if (transaction.type === TransactionType.TRANSFER && transaction.transferPairId) {
      await this.transfers.removePair(transaction.transferPairId, householdId);
      return;
    }

    await this.repo.manager.transaction(async (manager) => {
      await this.balances.reverse(transaction, manager);
      await manager.getRepository(Transaction).delete(id);
    });
  }
}
