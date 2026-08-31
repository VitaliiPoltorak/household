import { AuditLog } from '@household/audit';
import { Household } from '../households/entities/household.entity';
import { HouseholdMember } from '../households/entities/household-member.entity';
import { HouseholdInvite } from '../households/entities/household-invite.entity';

export const entities = [Household, HouseholdMember, HouseholdInvite, AuditLog];
