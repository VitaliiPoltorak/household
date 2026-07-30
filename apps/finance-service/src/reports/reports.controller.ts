import { Controller, Get, Headers, Query, UnauthorizedException, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('monthly')
  @ApiQuery({ name: 'year', type: Number })
  @ApiQuery({ name: 'month', type: Number, description: '1–12' })
  getMonthly(
    @Headers('x-household-id') hid: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('month', new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) month: number,
  ) {
    this.require(hid);
    return this.svc.getMonthly(hid, year, month);
  }

  @Get('by-category')
  @ApiQuery({ name: 'from', description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'type', enum: ['income', 'expense'] })
  getByCategory(
    @Headers('x-household-id') hid: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('type') type: 'income' | 'expense' = 'expense',
  ) {
    this.require(hid);
    return this.svc.getByCategory(hid, from, to, type);
  }

  @Get('net-worth')
  getNetWorth(@Headers('x-household-id') hid: string) {
    this.require(hid);
    return this.svc.getNetWorth(hid);
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
