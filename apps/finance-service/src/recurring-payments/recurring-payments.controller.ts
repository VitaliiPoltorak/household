import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, Query, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { RecurringPaymentsService } from './recurring-payments.service';
import { CreateRecurringPaymentDto, UpdateRecurringPaymentDto } from './dto/recurring-payment.dto';

@ApiTags('Recurring Payments')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('recurring-payments')
export class RecurringPaymentsController {
  constructor(private readonly svc: RecurringPaymentsService) {}

  @Post()
  create(@Headers('x-household-id') hid: string, @Body() dto: CreateRecurringPaymentDto) {
    this.require(hid);
    return this.svc.create(hid, dto);
  }

  @Get('upcoming')
  @ApiQuery({ name: 'days', required: false, type: Number })
  findUpcoming(@Headers('x-household-id') hid: string, @Query('days') days?: string) {
    this.require(hid);
    return this.svc.findUpcoming(hid, days ? parseInt(days, 10) : undefined);
  }

  @Get()
  findAll(@Headers('x-household-id') hid: string) {
    this.require(hid);
    return this.svc.findAll(hid);
  }

  @Get(':id')
  findOne(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.findOne(id, hid);
  }

  @Patch(':id')
  update(@Headers('x-household-id') hid: string, @Param('id') id: string, @Body() dto: UpdateRecurringPaymentDto) {
    this.require(hid);
    return this.svc.update(id, hid, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.remove(id, hid);
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
