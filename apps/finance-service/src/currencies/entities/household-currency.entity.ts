import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Currency } from './currency.entity';

// Which catalog currencies a household has enabled (#226) — mirrors the
// household-agnostic-catalog + per-household-enablement join pattern already
// used for stores/products in shopping-service.
@Entity({ name: 'household_currencies', schema: 'finance' })
@Unique(['householdId', 'currencyCode'])
export class HouseholdCurrency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'household_id' })
  householdId: string;

  @Column({ name: 'currency_code', length: 10 })
  currencyCode: string;

  @CreateDateColumn({ name: 'enabled_at' })
  enabledAt: Date;

  // RESTRICT: a global catalog currency is never deleted while a household
  // still references it — there's no delete endpoint on the catalog at all.
  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_code' })
  currency: Currency;
}
