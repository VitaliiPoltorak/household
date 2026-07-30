import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaProducerService } from '@household/kafka';
import { Account } from './entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
    private readonly kafka: KafkaProducerService,
  ) {}

  async create(householdId: string, userId: string, dto: CreateAccountDto): Promise<Account> {
    const account = await this.repo.save(
      this.repo.create({ ...dto, householdId }),
    );
    await this.kafka.emit('finance.account.created', { accountId: account.id, householdId }, { userId, householdId });
    return account;
  }

  findAll(householdId: string): Promise<Account[]> {
    return this.repo.find({ where: { householdId, isArchived: false } });
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

  async adjustBalance(id: string, delta: number): Promise<void> {
    if (delta > 0) {
      await this.repo.increment({ id }, 'balance', delta);
    } else if (delta < 0) {
      await this.repo.decrement({ id }, 'balance', Math.abs(delta));
    }
  }

  async getSummary(householdId: string): Promise<{ totalBalance: number; accounts: Account[] }> {
    const accounts = await this.findAll(householdId);
    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
    return { totalBalance, accounts };
  }
}
