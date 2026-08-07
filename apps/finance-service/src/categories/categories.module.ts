import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecurringPayment } from '../recurring-payments/entities/recurring-payment.entity';

@Module({
  // Transaction/RecurringPayment repos are read-only from here (impact counts).
  // Registering them via forFeature avoids importing the sibling modules and
  // the circular dependency that would create for the transactions/recurring
  // modules that already depend on categories.
  imports: [TypeOrmModule.forFeature([Category, Transaction, RecurringPayment])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
