import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { HouseholdInvite } from './entities/household-invite.entity';
import { HouseholdsService } from './households.service';
import { MembersService } from './members.service';
import { InvitesService } from './invites.service';
import { HouseholdsController } from './households.controller';
import { InvitesController } from '../invites/invites.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Household, HouseholdMember, HouseholdInvite])],
  controllers: [HouseholdsController, InvitesController],
  providers: [HouseholdsService, MembersService, InvitesService],
})
export class HouseholdsModule {}
