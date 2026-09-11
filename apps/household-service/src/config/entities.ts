import { AuditLog } from '@household/audit';
import { Household } from '../households/entities/household.entity';
import { HouseholdMember } from '../households/entities/household-member.entity';
import { HouseholdInvite } from '../households/entities/household-invite.entity';
import { FeatureFlag } from '../feature-flags/entities/feature-flag.entity';
import { FeatureFlagOverride } from '../feature-flags/entities/feature-flag-override.entity';

export const entities = [
  Household,
  HouseholdMember,
  HouseholdInvite,
  AuditLog,
  FeatureFlag,
  FeatureFlagOverride,
];
