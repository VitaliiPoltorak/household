import { Module } from '@nestjs/common';
import { HouseholdEventsConsumer } from './household-events.consumer';

@Module({
  providers: [HouseholdEventsConsumer],
})
export class EventsModule {}
