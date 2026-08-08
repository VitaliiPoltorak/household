import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringPayment } from './entities/recurring-payment.entity';
import { RecurringPaymentsService } from './recurring-payments.service';
import { RecurringPaymentsController } from './recurring-payments.controller';
import { RecurringPaymentScheduler } from './recurring-payment.scheduler';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TypeOrmModule.forFeature([RecurringPayment]), TransactionsModule],
  controllers: [RecurringPaymentsController],
  providers: [RecurringPaymentsService, RecurringPaymentScheduler],
})
export class RecurringPaymentsModule {}
