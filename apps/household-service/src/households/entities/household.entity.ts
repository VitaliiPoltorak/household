import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@household/database';
import { HouseholdMember } from './household-member.entity';
import { HouseholdInvite } from './household-invite.entity';

@Entity({ name: 'households', schema: 'household' })
export class Household extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @OneToMany(() => HouseholdMember, (m) => m.household, { cascade: true })
  members: HouseholdMember[];

  @OneToMany(() => HouseholdInvite, (i) => i.household, { cascade: true })
  invites: HouseholdInvite[];
}
