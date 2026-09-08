import { Module } from '@nestjs/common';
import { HouseholdEventsConsumer } from './household-events.consumer';
import { CurrenciesModule } from '../currencies/currencies.module';
import { AccountTypesModule } from '../account-types/account-types.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CurrenciesModule, AccountTypesModule, CategoriesModule],
  providers: [HouseholdEventsConsumer],
})
export class EventsModule {}
