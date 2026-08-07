import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncomeSource } from './entities/income-source.entity';
import { IncomeSourcesService } from './income-sources.service';
import { IncomeSourcesController } from './income-sources.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IncomeSource])],
  controllers: [IncomeSourcesController],
  providers: [IncomeSourcesService],
  exports: [IncomeSourcesService],
})
export class IncomeSourcesModule {}
