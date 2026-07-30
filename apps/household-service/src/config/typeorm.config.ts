import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { Household } from '../households/entities/household.entity';
import { HouseholdMember } from '../households/entities/household-member.entity';
import { HouseholdInvite } from '../households/entities/household-invite.entity';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'household',
    entities: [Household, HouseholdMember, HouseholdInvite],
    migrations: ['src/migrations/*.ts'],
  }),
  synchronize: false,
});
