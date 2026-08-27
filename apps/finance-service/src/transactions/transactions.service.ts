import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
  LIST_HARD_LIMIT,
} from '@household/contracts';
import { nextDayIso } from '@household/common';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { IncomeSourcesService } from '../income-sources/income-sources.service';
import {
  Transaction,
  TransactionType,
  TransferDirection,
} from './entities/transaction.entity';
import {
  CreateTransactionDto,
  CreateTransferDto,
  TransactionResponseDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
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
    private readonly categoriesService: CategoriesService,
    private readonly incomeSourcesService: IncomeSourcesService,
    private readonly balances: BalanceAdjustmentService,
    private readonly transfers: TransferDomainService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  // Prevents IDOR: a caller must not be able to reference another household's
  // account/category/incomeSource by ID. findOne is scoped by householdId and
  // throws NotFoundException on miss.
  private async assertReferencesBelongToHousehold(
    householdId: string,
    refs: {
      accountId?: string;
      categoryId?: string | null;
      incomeSourceId?: string | null;
    },
  ): Promise<void> {
    const checks: Promise<unknown>[] = [];
    if (refs.accountId)
      checks.push(this.accountsService.findOne(refs.accountId, householdId));
    if (refs.categoryId)
      checks.push(this.categoriesService.findOne(refs.categoryId, householdId));
    if (refs.incomeSourceId)
      checks.push(
        this.incomeSourcesService.findOne(refs.incomeSourceId, householdId),
      );
    await Promise.all(checks);
  }

  async create(
    householdId: string,
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Defence-in-depth. DTO already restricts via @IsEnum, but a transfer
    // created here would skip the paired-leg logic in createTransfer() and
    // leave the ledger in an unpaired state.
    if ((dto.type as TransactionType) === TransactionType.TRANSFER) {
      throw new BadRequestException(
        'Use POST /transactions/transfer to create transfers',
      );
    }

    // Idempotency for integrations that retry (e.g. integration-service's
    // Monobank map endpoint, #21) — a repeated call with the same
    // externalId returns the transaction already created instead of
    // double-booking it and double-applying the balance delta.
    if (dto.externalId) {
      const existing = await this.repo.findOne({
        where: { householdId, externalId: dto.externalId },
      });
      if (existing) return existing;
    }

    await this.assertReferencesBelongToHousehold(householdId, {
      accountId: dto.accountId,
      categoryId: dto.categoryId,
      incomeSourceId: dto.incomeSourceId,
    });

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

  /**
   * Returns the household's transactions with transfer pairs collapsed to a
   * single row (#167). Each returned row carries `counterAccountId` +
   * `counterTransactionId` when it represents a transfer.
   *
   * Filter-by-account rule: a transfer surfaces when EITHER leg matches the
   * filtered account. The row returned is the matched leg (so the user sees
   * "their" account as the primary side), and the counterparty is the other
   * side of the pair.
   *
   * Ordering: keeps DESC-by-date. For transfers where the DEBIT and CREDIT
   * legs are always inserted with the same date, the debit leg's date wins.
   */
  async findAll(
    householdId: string,
    query: {
      type?: TransactionType;
      accountId?: string;
      categoryId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<TransactionResponseDto[]> {
    // Base query — always household-scoped; date and type filters are also
    // simple WHEREs. accountId is applied AFTER dedupe so we don't drop the
    // paired counterpart mid-flight.
    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.householdId = :householdId', { householdId });

    if (query.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query.categoryId)
      qb.andWhere('t.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });

    // Half-open interval on the upper bound so the query stays correct if
    // Transaction.date is ever migrated from DATE to TIMESTAMP (#82).
    if (query.from) qb.andWhere('t.date >= :from', { from: query.from });
    if (query.to)
      qb.andWhere('t.date < :toExclusive', {
        toExclusive: nextDayIso(query.to),
      });

    // If the caller filtered by account, we must include BOTH legs of any
    // transfer that touches that account (so we can pick the matched leg
    // AND still have the counterparty available to attach). SQL: match if
    // either accountId or the pair's other leg matches. We do this via a
    // subquery lookup on transferPairId.
    if (query.accountId) {
      qb.andWhere(
        `(t.accountId = :accountId
          OR t.transferPairId IN (
            SELECT tp.transfer_pair_id
            FROM finance.transactions tp
            WHERE tp.household_id = :householdId
              AND tp.account_id = :accountId
              AND tp.transfer_pair_id IS NOT NULL
          ))`,
        { accountId: query.accountId, householdId },
      );
    }

    const rows = await qb
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.createdAt', 'DESC')
      .take(LIST_HARD_LIMIT)
      .getMany();

    return this.collapseTransferPairs(rows, query.accountId);
  }

  /**
   * Groups transfer legs by `transferPairId` and returns one row per pair.
   *
   * Which leg becomes the "primary" row:
   *   - If the caller filtered by an account and one leg matches → that one.
   *   - Otherwise → the DEBIT leg (source account), so the UI reads left→right
   *     as "money leaving X, arriving at Y".
   *   - If direction is missing (legacy), fall back to insertion order (the
   *     older row = debit) — same rule as TransferDomainService.removePair.
   *
   * Non-transfer rows pass through untouched (with all counter* fields null).
   *
   * Rows whose transferPairId points at a leg the caller cannot see (dropped
   * by householdId — should never happen given the WHERE clause, but belt +
   * suspenders) fall through as a plain row rather than crashing.
   */
  private collapseTransferPairs(
    rows: Transaction[],
    filterAccountId: string | undefined,
  ): TransactionResponseDto[] {
    // Group transfer legs by pair id, keep everything else as-is.
    const pairs = new Map<string, Transaction[]>();
    const singles: Transaction[] = [];

    for (const row of rows) {
      if (row.isTransferLeg() && row.transferPairId) {
        const bucket = pairs.get(row.transferPairId) ?? [];
        bucket.push(row);
        pairs.set(row.transferPairId, bucket);
      } else {
        singles.push(row);
      }
    }

    const collapsed: Array<{
      primary: Transaction;
      counter: Transaction | null;
    }> = [];

    for (const legs of pairs.values()) {
      if (legs.length === 1) {
        // Half-paired (orphan) — surface as a plain transfer row without a
        // counterparty. Shouldn't happen post-#167 but stays safe.
        collapsed.push({ primary: legs[0], counter: null });
        continue;
      }
      const { primary, counter } = this.pickPrimaryLeg(legs, filterAccountId);
      collapsed.push({ primary, counter });
    }

    for (const single of singles) {
      collapsed.push({ primary: single, counter: null });
    }

    // Re-sort after collapse so pairs land at the correct date position.
    collapsed.sort((a, b) => {
      if (a.primary.date !== b.primary.date)
        return a.primary.date < b.primary.date ? 1 : -1;
      return a.primary.createdAt < b.primary.createdAt ? 1 : -1;
    });

    return collapsed.map(({ primary, counter }) =>
      TransactionResponseDto.fromEntity(primary, counter),
    );
  }

  private pickPrimaryLeg(
    legs: Transaction[],
    filterAccountId: string | undefined,
  ): { primary: Transaction; counter: Transaction } {
    // Filter-by-account wins: whichever leg matches becomes primary so the
    // user's filtered account reads as the "own" side of the transfer.
    if (filterAccountId) {
      const matched = legs.find((l) => l.accountId === filterAccountId);
      if (matched) {
        const other = legs.find((l) => l.id !== matched.id)!;
        return { primary: matched, counter: other };
      }
    }
    // Default: debit leg (source) is primary.
    const debit = legs.find(
      (l) => l.transferDirection === TransferDirection.DEBIT,
    );
    const credit = legs.find(
      (l) => l.transferDirection === TransferDirection.CREDIT,
    );
    if (debit && credit) return { primary: debit, counter: credit };

    // Legacy fallback: older insert = debit, newer = credit.
    const sorted = [...legs].sort((a, b) =>
      a.createdAt < b.createdAt
        ? -1
        : a.createdAt > b.createdAt
          ? 1
          : a.id < b.id
            ? -1
            : 1,
    );
    return { primary: sorted[0], counter: sorted[1] };
  }

  async findOne(id: string, householdId: string): Promise<Transaction> {
    const transaction = await this.repo.findOne({ where: { id, householdId } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async update(
    id: string,
    householdId: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const existing = await this.findOne(id, householdId);

    if (
      dto.type !== undefined &&
      (dto.type as TransactionType) === TransactionType.TRANSFER
    ) {
      throw new BadRequestException(
        'Cannot change transaction type to transfer',
      );
    }
    if (existing.isTransferLeg() && dto.type !== undefined) {
      throw new BadRequestException('Cannot change type of a transfer leg');
    }

    await this.assertReferencesBelongToHousehold(householdId, {
      categoryId: dto.categoryId,
      incomeSourceId: dto.incomeSourceId,
    });

    const newAmount = dto.amount ?? Number(existing.amount);
    const newType = dto.type ?? existing.type;

    const updated = await this.repo.manager.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);

      // Recalculate balance when amount or type changes (skip for transfers — both legs must stay in sync)
      if (
        !existing.isTransferLeg() &&
        (dto.amount !== undefined || dto.type !== undefined)
      ) {
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
      await this.balances.apply(
        accountId,
        TransactionType.ADJUSTMENT,
        delta,
        manager,
      );
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

    if (transaction.isTransferLeg() && transaction.transferPairId) {
      await this.transfers.removePair(transaction.transferPairId, householdId);
      return;
    }

    await this.repo.manager.transaction(async (manager) => {
      await this.balances.reverse(transaction, manager);
      await manager.getRepository(Transaction).delete(id);
    });
  }
}
