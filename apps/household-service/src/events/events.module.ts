import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HouseholdMember } from '../households/entities/household-member.entity';
import { AuthEventsConsumer } from './auth-events.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([HouseholdMember])],
  providers: [AuthEventsConsumer],
})
export class EventsModule {}
