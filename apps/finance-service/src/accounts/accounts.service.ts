import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher, LIST_HARD_LIMIT } from '@household/contracts';
import { Account } from './entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async create(householdId: string, userId: string, dto: CreateAccountDto): Promise<Account> {
    const account = await this.repo.save(
      this.repo.create({ ...dto, householdId }),
    );
    await this.events.emit('finance.account.created', { accountId: account.id, householdId }, { userId, householdId });
    return account;
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

  async update(id: string, householdId: string, dto: UpdateAccountDto): Promise<Account> {
    await this.findOne(id, householdId);
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.update(id, { isArchived: true });
  }

  async adjustBalance(id: string, delta: number, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Account) : this.repo;
    if (delta > 0) {
      await repo.increment({ id }, 'balance', delta);
    } else if (delta < 0) {
      await repo.decrement({ id }, 'balance', Math.abs(delta));
    }
  }

  async getSummary(householdId: string): Promise<{ totalBalance: number; accounts: Account[] }> {
    const accounts = await this.findAll(householdId);
    // SUM in SQL keeps DECIMAL precision through aggregation. The pg driver
    // returns numeric as a string; a single parseFloat at the JS boundary is
    // far more accurate than N repeated JS float additions.
    const raw = await this.repo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.balance), 0)', 'total')
      .where('a.household_id = :hid AND a.is_archived = false', { hid: householdId })
      .getRawOne<{ total: string }>();
    const totalBalance = Number(raw?.total ?? '0');
    return { totalBalance, accounts };
  }
}
