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
    // Grouped by (date, currency) so a household with UAH + USD accounts gets
    // two rows per day — summing across currencies without conversion is
    // arithmetically meaningless (#175). Callers convert per-currency.
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.date', 'date')
      .addSelect('t.currency', 'currency')
      .addSelect(`SUM(CASE WHEN t.type = 'income' THEN CAST(t.amount AS FLOAT) ELSE 0 END)`, 'income')
      .addSelect(`SUM(CASE WHEN t.type = 'expense' THEN CAST(t.amount AS FLOAT) ELSE 0 END)`, 'expense')
      .where('t."household_id" = :householdId', { householdId })
      .andWhere('t.date >= :from', { from: range.from })
      // Half-open upper bound so this stays correct if the column becomes TIMESTAMP (#82).
      .andWhere('t.date < :toExclusive', { toExclusive: nextDayIso(range.to) })
      .andWhere(`t.type IN ('income', 'expense')`)
      .groupBy('t.date')
      .addGroupBy('t.currency')
      .orderBy('t.date', 'ASC')
      .addOrderBy('t.currency', 'ASC')
      .getRawMany<{ date: string; currency: string; income: string; expense: string }>();

    return rows.map((r) => ({
      date: r.date,
      currency: r.currency,
      income: Number(r.income),
      expense: Number(r.expense),
    }));
  }

  async getByCategory(
    householdId: string,
    range: DateRange,
    type: 'income' | 'expense',
  ): Promise<CategoryAggregate[]> {
    // Grouped by (categoryId, currency) — same reason as getDailyIncomeExpense
    // (#175). A category used across accounts of different currencies now
    // returns one row per (category, currency) pair.
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t."category_id"', 'categoryId')
      .addSelect('t.currency', 'currency')
      .addSelect('SUM(CAST(t.amount AS FLOAT))', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('t."household_id" = :householdId', { householdId })
      .andWhere('t.date >= :from', { from: range.from })
      // Half-open upper bound so this stays correct if the column becomes TIMESTAMP (#82).
      .andWhere('t.date < :toExclusive', { toExclusive: nextDayIso(range.to) })
      .andWhere('t.type = :type', { type })
      .groupBy('t."category_id"')
      .addGroupBy('t.currency')
      .orderBy('total', 'DESC')
      .getRawMany<{ categoryId: string | null; currency: string; total: string; count: string }>();

    return rows.map((r) => ({
      categoryId: r.categoryId,
      currency: r.currency,
      total: Number(r.total),
      count: Number(r.count),
    }));
  }
}
