import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * Currency exchange rate as reported by a specific source (PrivatBank, NBU, ...)
 * on a specific effective date. Matches PrivatBank's model:
 *   - `ccy`      — foreign currency ("USD")
 *   - `baseCcy`  — reference currency for the rate ("UAH")
 *   - `buy`/`sale` — how many `baseCcy` for 1 `ccy`
 */
@Entity({ name: 'exchange_rates', schema: 'finance' })
@Index('uq_rate_per_day', ['effectiveDate', 'source', 'ccy', 'baseCcy'], { unique: true })
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 3 })
  ccy: string;

  @Column({ name: 'base_ccy', length: 3 })
  baseCcy: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  buy: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  sale: string;

  @Column({ length: 32 })
  source: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @CreateDateColumn({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}
