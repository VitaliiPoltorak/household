import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankConnection } from '../bank-connections/entities/bank-connection.entity';
import { HouseholdEventsConsumer } from './household-events.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([BankConnection])],
  providers: [HouseholdEventsConsumer],
})
export class EventsModule {}
