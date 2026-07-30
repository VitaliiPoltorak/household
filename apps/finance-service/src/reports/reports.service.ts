import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionType } from '../transactions/entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { Category, CategoryType } from '../categories/entities/category.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async getMonthly(householdId: string, year: number, month: number) {
    if (month < 1 || month > 12) throw new BadRequestException('month must be 1–12');

    const pad = (n: number) => n.toString().padStart(2, '0');
    const from = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${pad(month)}-${lastDay}`;

    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t.date', 'date')
      .addSelect(`SUM(CASE WHEN t.type = 'income' THEN CAST(t.amount AS FLOAT) ELSE 0 END)`, 'income')
      .addSelect(`SUM(CASE WHEN t.type = 'expense' THEN CAST(t.amount AS FLOAT) ELSE 0 END)`, 'expense')
      .where('t."household_id" = :householdId', { householdId })
      .andWhere('t.date >= :from', { from })
      .andWhere('t.date <= :to', { to })
      .andWhere(`t.type IN ('income', 'expense')`)
      .groupBy('t.date')
      .orderBy('t.date', 'ASC')
      .getRawMany<{ date: string; income: string; expense: string }>();

    const totalIncome = rows.reduce((s, r) => s + Number(r.income), 0);
    const totalExpense = rows.reduce((s, r) => s + Number(r.expense), 0);

    return {
      period: `${year}-${pad(month)}`,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      byDay: rows.map((r) => ({
        date: r.date,
        income: Number(r.income),
        expense: Number(r.expense),
      })),
    };
  }

  async getByCategory(
    householdId: string,
    from: string,
    to: string,
    type: 'income' | 'expense',
  ) {
    if (!from || !to) throw new BadRequestException('from and to are required');

    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t."category_id"', 'categoryId')
      .addSelect('SUM(CAST(t.amount AS FLOAT))', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('t."household_id" = :householdId', { householdId })
      .andWhere('t.date >= :from', { from })
      .andWhere('t.date <= :to', { to })
      .andWhere('t.type = :type', { type })
      .groupBy('t."category_id"')
      .orderBy('total', 'DESC')
      .getRawMany<{ categoryId: string | null; total: string; count: string }>();

    const categoryIds = rows
      .filter((r) => r.categoryId)
      .map((r) => r.categoryId as string);

    const categories =
      categoryIds.length > 0
        ? await this.categoryRepo.findByIds(categoryIds)
        : [];

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (categoryMap.get(r.categoryId) ?? null) : null,
      total: Number(r.total),
      count: Number(r.count),
    }));
  }

  async getNetWorth(householdId: string) {
    const accounts = await this.accountRepo.find({
      where: { householdId, isArchived: false },
    });

    const byCurrency = accounts.reduce<Record<string, number>>((acc, a) => {
      acc[a.currency] = (acc[a.currency] ?? 0) + Number(a.balance);
      return acc;
    }, {});

    const totalBalance = Object.values(byCurrency).reduce((s, v) => s + v, 0);

    return {
      totalBalance,
      byCurrency,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance: Number(a.balance),
      })),
    };
  }
}
