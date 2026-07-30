import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@household/database';

export enum IncomeSourceType {
  SALARY = 'salary',
  PROJECT = 'project',
  DIVIDEND = 'dividend',
  RENT = 'rent',
  OTHER = 'other',
}

@Entity({ name: 'income_sources', schema: 'finance' })
export class IncomeSource extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: IncomeSourceType })
  type: IncomeSourceType;
}
