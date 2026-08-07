import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';
import type { IAccountQueryRepository } from './account-query.repository';
import type { CurrencyTotal } from './report-query.types';

@Injectable()
export class TypeormAccountQueryRepository implements IAccountQueryRepository {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  listActive(householdId: string): Promise<Account[]> {
    return this.repo.find({
      where: { householdId, isArchived: false },
    });
  }

  async getBalancesByCurrency(householdId: string): Promise<CurrencyTotal[]> {
    // Aggregate per currency in SQL so DECIMAL precision is preserved through
    // the sum, instead of N repeated JS float additions per row.
    const rows = await this.repo
      .createQueryBuilder('a')
      .select('a.currency', 'currency')
      .addSelect('COALESCE(SUM(a.balance), 0)', 'total')
      .where('a.household_id = :hid AND a.is_archived = false', { hid: householdId })
      .groupBy('a.currency')
      .getRawMany<{ currency: string; total: string }>();

    return rows.map((r) => ({ currency: r.currency, total: Number(r.total) }));
  }
}
