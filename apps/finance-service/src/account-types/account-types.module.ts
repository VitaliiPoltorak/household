import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountTypeCatalog } from './entities/account-type-catalog.entity';
import { HouseholdAccountType } from './entities/household-account-type.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountTypesService } from './account-types.service';
import { AccountTypesController } from './account-types.controller';

// Registers Account directly (rather than importing AccountsModule) to avoid
// a circular dependency — AccountsModule imports AccountTypesModule to
// validate Account.type against the enabled set. Same pattern as
// CurrenciesModule (#226).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountTypeCatalog,
      HouseholdAccountType,
      Account,
    ]),
  ],
  controllers: [AccountTypesController],
  providers: [AccountTypesService],
  exports: [AccountTypesService],
})
export class AccountTypesModule {}
