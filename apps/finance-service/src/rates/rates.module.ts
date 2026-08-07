import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { RatesService } from './rates.service';
import { RatesController } from './rates.controller';
import { RatesScheduler } from './rates.scheduler';
import { PrivatBankClient } from './clients/privatbank.client';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate]), ScheduleModule.forRoot()],
  controllers: [RatesController],
  providers: [RatesService, RatesScheduler, PrivatBankClient],
  exports: [RatesService],
})
export class RatesModule {}
