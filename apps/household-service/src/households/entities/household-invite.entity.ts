import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@household/database';
import { Household } from './household.entity';
import { MemberRole } from './member-role.enum';

@Entity({ name: 'household_invites', schema: 'household' })
export class HouseholdInvite extends BaseEntity {
  @Column({ name: 'household_id' })
  householdId: string;

  @Column()
  email: string;

  @Column({ unique: true })
  token: string;

  @Column({ type: 'enum', enum: MemberRole, default: MemberRole.MEMBER })
  role: MemberRole;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @ManyToOne(() => Household, (h) => h.invites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'household_id' })
  household: Household;
}
