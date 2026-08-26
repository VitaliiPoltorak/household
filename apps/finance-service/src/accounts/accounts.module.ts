import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { CurrenciesModule } from '../currencies/currencies.module';
import { AccountTypesModule } from '../account-types/account-types.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account]),
    CurrenciesModule,
    AccountTypesModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
