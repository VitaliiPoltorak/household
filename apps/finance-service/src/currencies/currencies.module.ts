import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { HouseholdCurrency } from './entities/household-currency.entity';
import { Account } from '../accounts/entities/account.entity';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';

// Registers Account directly (rather than importing AccountsModule) to avoid
// a circular dependency — AccountsModule imports CurrenciesModule to validate
// Account.currency against the enabled set. Same pattern StoresModule uses
// for its cross-entity impact checks in shopping-service.
@Module({
  imports: [TypeOrmModule.forFeature([Currency, HouseholdCurrency, Account])],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
