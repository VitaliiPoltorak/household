import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nextDayIso } from '@household/common';
import { Transaction } from '../../transactions/entities/transaction.entity';
import type {
  CategoryAggregate,
  DailyIncomeExpense,
  DateRange,
} from './report-query.types';
import type { ITransactionQueryRepository } from './transaction-query.repository';

@Injectable()
export class TypeormTransactionQueryRepository implements ITransactionQueryRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
  ) {}

  async getDailyIncomeExpense(
    householdId: string,
    range: DateRange,
  ): Promise<DailyIncomeExpense[]> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.date', 'date')
      .addSelect(`SUM(CASE WHEN t.type = 'income' THEN CAST(t.amount AS FLOAT) ELSE 0 END)`, 'income')
      .addSelect(`SUM(CASE WHEN t.type = 'expense' THEN CAST(t.amount AS FLOAT) ELSE 0 END)`, 'expense')
      .where('t."household_id" = :householdId', { householdId })
      .andWhere('t.date >= :from', { from: range.from })
      // Half-open upper bound so this stays correct if the column becomes TIMESTAMP (#82).
      .andWhere('t.date < :toExclusive', { toExclusive: nextDayIso(range.to) })
      .andWhere(`t.type IN ('income', 'expense')`)
      .groupBy('t.date')
      .orderBy('t.date', 'ASC')
      .getRawMany<{ date: string; income: string; expense: string }>();

    return rows.map((r) => ({
      date: r.date,
      income: Number(r.income),
      expense: Number(r.expense),
    }));
  }

  async getByCategory(
    householdId: string,
    range: DateRange,
    type: 'income' | 'expense',
  ): Promise<CategoryAggregate[]> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t."category_id"', 'categoryId')
      .addSelect('SUM(CAST(t.amount AS FLOAT))', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('t."household_id" = :householdId', { householdId })
      .andWhere('t.date >= :from', { from: range.from })
      // Half-open upper bound so this stays correct if the column becomes TIMESTAMP (#82).
      .andWhere('t.date < :toExclusive', { toExclusive: nextDayIso(range.to) })
      .andWhere('t.type = :type', { type })
      .groupBy('t."category_id"')
      .orderBy('total', 'DESC')
      .getRawMany<{ categoryId: string | null; total: string; count: string }>();

    return rows.map((r) => ({
      categoryId: r.categoryId,
      total: Number(r.total),
      count: Number(r.count),
    }));
  }
}
