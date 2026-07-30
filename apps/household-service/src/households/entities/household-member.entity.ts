import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '@household/database';
import { Household } from './household.entity';
import { MemberRole } from './member-role.enum';

@Entity({ name: 'household_members', schema: 'household' })
@Unique(['householdId', 'userId'])
export class HouseholdMember extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: MemberRole, default: MemberRole.MEMBER })
  role: MemberRole;

  @ManyToOne(() => Household, (h) => h.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'household_id' })
  household: Household;
}
