import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccountTypeCatalog } from './account-type-catalog.entity';

// Which catalog account types a household has enabled (#227) — same join
// pattern as HouseholdCurrency (#226).
@Entity({ name: 'household_account_types', schema: 'finance' })
@Unique(['householdId', 'typeCode'])
export class HouseholdAccountType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'household_id' })
  householdId: string;

  @Column({ name: 'type_code', length: 40 })
  typeCode: string;

  @CreateDateColumn({ name: 'enabled_at' })
  enabledAt: Date;

  // RESTRICT: the catalog entry stays as long as any household references
  // it — including other households that also enabled the same custom type.
  @ManyToOne(() => AccountTypeCatalog, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_code' })
  accountType: AccountTypeCatalog;
}
