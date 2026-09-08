import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
  LIST_HARD_LIMIT,
} from '@household/contracts';
import { Account } from './entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { InsufficientFundsException } from './insufficient-funds.exception';
import { CurrenciesService } from '../currencies/currencies.service';
import { AccountTypesService } from '../account-types/account-types.service';

const UNIQUE_VIOLATION = '23505';
const DEFAULT_CURRENCY = 'UAH';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
    private readonly currencies: CurrenciesService,
    private readonly accountTypes: AccountTypesService,
  ) {}

  async create(
    householdId: string,
    userId: string,
    dto: CreateAccountDto,
  ): Promise<Account> {
    const { initialBalance, ...rest } = dto;
    const currency = dto.currency ?? DEFAULT_CURRENCY;
    await this.currencies.assertEnabled(householdId, currency);
    await this.accountTypes.assertEnabled(householdId, dto.type);
    const account = this.repo.create({
      ...rest,
      currency,
      householdId,
      // Starting state, not an event — see CreateAccountDto.initialBalance.
      balance: initialBalance ?? 0,
      nameNormalized: normalizeAccountName(dto.name),
    });
    const saved = await this.save(account, dto.name);
    await this.events.emit(
      'finance.account.created',
      { accountId: saved.id, householdId },
      { userId, householdId },
    );
    return saved;
  }

  findAll(householdId: string): Promise<Account[]> {
    return this.repo.find({
      where: { householdId, isArchived: false },
      order: { name: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async findOne(id: string, householdId: string): Promise<Account> {
    const account = await this.repo.findOne({ where: { id, householdId } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async update(
    id: string,
    householdId: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findOne(id, householdId);
    if (dto.currency !== undefined) {
      await this.currencies.assertEnabled(householdId, dto.currency);
    }
    if (dto.type !== undefined) {
      await this.accountTypes.assertEnabled(householdId, dto.type);
    }
    Object.assign(account, dto);
    if (dto.name !== undefined) {
      account.nameNormalized = normalizeAccountName(dto.name);
    }
    return this.save(account, account.name);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.update(id, { isArchived: true });
  }

  /**
   * Applies `delta` to an account's balance.
   *
   * Withdrawals (`delta < 0`) are refused when they would take an account that
   * does not allow a negative balance below zero (#326).
   *
   * The guard is ON BY DEFAULT and callers opt out explicitly, rather than the
   * other way round. A new call site that forgets to think about overdraft
   * gets the safe behaviour; only the paths that genuinely must be allowed
   * through — reversals and corrections, listed at each call site — pass
   * `allowOverdraft`. Past audits kept finding the opposite arrangement, where
   * a rule was applied in one place and every later caller silently missed it.
   *
   * The check is the WHERE clause of the mutating UPDATE, not a read followed
   * by a write. That is the whole point: two concurrent withdrawals that each
   * pass a separate SELECT can still overdraw the account between the check
   * and the update, and a `SELECT ... FOR UPDATE` would additionally invite
   * deadlocks on the two-account transfer path, where the pair of rows is
   * locked in payload order. One statement has neither problem — Postgres
   * re-evaluates the predicate against the row it locks.
   *
   * Built through the query builder rather than manager.query() so `affected`
   * is a reliable row count. The raw-SQL form is a trap here: for an
   * `UPDATE ... RETURNING`, TypeORM's query() hands back `[rows, count]`, so
   * the obvious `result.length > 0` success test is true even when the
   * predicate matched nothing — the balance is left correctly untouched while
   * the caller is told the withdrawal succeeded and books the transaction
   * anyway.
   */
  async adjustBalance(
    id: string,
    delta: number,
    manager?: EntityManager,
    opts: { allowOverdraft?: boolean } = {},
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Account) : this.repo;
    if (delta > 0) {
      await repo.increment({ id }, 'balance', delta);
      return;
    }
    if (delta === 0) return;

    const amount = Math.abs(delta);
    if (opts.allowOverdraft) {
      await repo.decrement({ id }, 'balance', amount);
      return;
    }

    // Mirrors Account.canWithdraw — keep the two in step.
    const result = await repo
      .createQueryBuilder()
      .update(Account)
      .set({ balance: () => '"balance" - :amount' })
      .where('id = :id')
      .andWhere('("allows_negative_balance" = true OR "balance" >= :amount)')
      .setParameters({ id, amount })
      .execute();
    if ((result.affected ?? 0) > 0) return;

    // Nothing was updated: either the row is gone or the predicate failed.
    // Only now is a read worth paying for, and only to build a useful error.
    const account = await repo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    throw new InsufficientFundsException({
      accountId: account.id,
      accountName: account.name,
      available: Number(account.balance),
      requested: amount,
      currency: account.currency,
    });
  }

  async getSummary(
    householdId: string,
  ): Promise<{ totalBalance: number; accounts: Account[] }> {
    const accounts = await this.findAll(householdId);
    // SUM in SQL keeps DECIMAL precision through aggregation. The pg driver
    // returns numeric as a string; a single parseFloat at the JS boundary is
    // far more accurate than N repeated JS float additions.
    const raw = await this.repo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.balance), 0)', 'total')
      .where('a.household_id = :hid AND a.is_archived = false', {
        hid: householdId,
      })
      .getRawOne<{ total: string }>();
    const totalBalance = Number(raw?.total ?? '0');
    return { totalBalance, accounts };
  }

  /** Saves and translates the (household_id, lower(name)) unique violation into a 409. */
  private async save(account: Account, name: string): Promise<Account> {
    try {
      return await this.repo.save(account);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          `An account named "${name}" already exists in this household`,
        );
      }
      throw err;
    }
  }
}

function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase();
}
