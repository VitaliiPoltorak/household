import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import {
  ACCOUNT_QUERY_REPOSITORY,
  IAccountQueryRepository,
} from './query/account-query.repository';
import {
  TRANSACTION_QUERY_REPOSITORY,
  ITransactionQueryRepository,
} from './query/transaction-query.repository';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(TRANSACTION_QUERY_REPOSITORY)
    private readonly txQuery: ITransactionQueryRepository,
    @Inject(ACCOUNT_QUERY_REPOSITORY)
    private readonly accountQuery: IAccountQueryRepository,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async getMonthly(householdId: string, year: number, month: number) {
    if (month < 1 || month > 12) throw new BadRequestException('month must be 1–12');

    const pad = (n: number) => n.toString().padStart(2, '0');
    const from = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${pad(month)}-${lastDay}`;

    const byDay = await this.txQuery.getDailyIncomeExpense(householdId, { from, to });

    // Roll up per-currency. Summing across currencies without conversion is
    // arithmetically meaningless (#175) — the client converts via PrivatBank
    // rates with the same rates-unavailable discipline as the Total balance
    // card.
    const byCurrency: Record<string, { income: number; expense: number; net: number }> = {};
    for (const r of byDay) {
      const bucket = (byCurrency[r.currency] ??= { income: 0, expense: 0, net: 0 });
      bucket.income += r.income;
      bucket.expense += r.expense;
      bucket.net = bucket.income - bucket.expense;
    }

    return {
      period: `${year}-${pad(month)}`,
      byCurrency,
      byDay,
    };
  }

  async getByCategory(
    householdId: string,
    from: string,
    to: string,
    type: 'income' | 'expense',
  ) {
    if (!from || !to) throw new BadRequestException('from and to are required');

    const rows = await this.txQuery.getByCategory(householdId, { from, to }, type);

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
      currency: r.currency,
      total: r.total,
      count: r.count,
    }));
  }

  async getNetWorth(householdId: string) {
    const accounts = await this.accountQuery.listActive(householdId);
    const balances = await this.accountQuery.getBalancesByCurrency(householdId);

    const byCurrency = Object.fromEntries(balances.map((r) => [r.currency, r.total]));
    // NOTE: summing across currencies is arithmetically meaningless — kept for
    // API compatibility. Cross-currency conversion happens on the client.
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
