import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { PrivatBankClient } from './clients/privatbank.client';
import { RateDto } from './dto/rate.dto';

const SOURCE = 'privatbank';

@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);

  constructor(
    @InjectRepository(ExchangeRate) private readonly repo: Repository<ExchangeRate>,
    private readonly privatbank: PrivatBankClient,
  ) {}

  /** Fetch from PrivatBank and upsert today's rates. Safe to call repeatedly. */
  async syncToday(): Promise<{ inserted: number; date: string }> {
    const rates = await this.privatbank.fetchRates();
    const today = isoDate(new Date());

    const rows = rates.map((r) =>
      this.repo.create({
        ccy: r.ccy,
        baseCcy: r.base_ccy,
        buy: r.buy,
        sale: r.sale,
        source: SOURCE,
        effectiveDate: today,
      }),
    );

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ExchangeRate)
      .values(rows)
      .orUpdate(['buy', 'sale', 'fetched_at'], ['effective_date', 'source', 'ccy', 'base_ccy'])
      .execute();

    this.logger.log(`Synced ${rows.length} rates from ${SOURCE} for ${today}`);
    return { inserted: rows.length, date: today };
  }

  /**
   * Return the most recent rates. Prefer today's; fall back to the latest
   * effective date we have so the UI still works if today's fetch failed.
   */
  async findLatest(): Promise<RateDto[]> {
    const row = await this.repo
      .createQueryBuilder('r')
      .select('MAX(r.effective_date)', 'max')
      .where('r.source = :source', { source: SOURCE })
      .getRawOne<{ max: string | null }>();

    if (!row?.max) return [];

    const rates = await this.repo.find({
      where: { source: SOURCE, effectiveDate: row.max },
      order: { ccy: 'ASC' },
    });
    return rates.map(toDto);
  }

  /** Historical rates for a single currency across a date range (inclusive). */
  async findRange(ccy: string, fromDate: string, toDate: string): Promise<RateDto[]> {
    const rates = await this.repo
      .createQueryBuilder('r')
      .where('r.source = :source', { source: SOURCE })
      .andWhere('r.ccy = :ccy', { ccy: ccy.toUpperCase() })
      .andWhere('r.effective_date BETWEEN :from AND :to', { from: fromDate, to: toDate })
      .orderBy('r.effective_date', 'ASC')
      .getMany();
    return rates.map(toDto);
  }
}

function toDto(r: ExchangeRate): RateDto {
  return {
    ccy: r.ccy,
    base_ccy: r.baseCcy,
    buy: r.buy,
    sale: r.sale,
    effective_date: r.effectiveDate,
    source: r.source,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
