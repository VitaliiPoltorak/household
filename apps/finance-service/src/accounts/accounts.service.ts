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

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async create(
    householdId: string,
    userId: string,
    dto: CreateAccountDto,
  ): Promise<Account> {
    const account = this.repo.create({
      ...dto,
      householdId,
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

  async adjustBalance(
    id: string,
    delta: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Account) : this.repo;
    if (delta > 0) {
      await repo.increment({ id }, 'balance', delta);
    } else if (delta < 0) {
      await repo.decrement({ id }, 'balance', Math.abs(delta));
    }
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
