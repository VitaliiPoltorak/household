import { Module } from '@nestjs/common';
import { HouseholdEventsConsumer } from './household-events.consumer';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [CurrenciesModule],
  providers: [HouseholdEventsConsumer],
})
export class EventsModule {}
