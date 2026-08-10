import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { RatesService } from './rates.service';
import { RateDto } from './dto/rate.dto';

@ApiTags('Rates')
@Controller('rates')
export class RatesController {
  constructor(private readonly svc: RatesService) {}

  @Get('latest')
  @ApiOperation({ summary: 'Latest currency exchange rates (from PrivatBank)' })
  latest(): Promise<RateDto[]> {
    return this.svc.findLatest();
  }

  @Get('history')
  @ApiOperation({ summary: 'Rates for one currency over a date range' })
  @ApiQuery({ name: 'ccy', example: 'USD' })
  @ApiQuery({ name: 'from', example: '2026-01-01' })
  @ApiQuery({ name: 'to', example: '2026-08-06' })
  history(
    @Query('ccy') ccy: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<RateDto[]> {
    if (!ccy || !from || !to) {
      throw new BadRequestException('ccy, from, to query params are required');
    }
    if (!isIsoDate(from) || !isIsoDate(to)) {
      throw new BadRequestException('from/to must be ISO dates (YYYY-MM-DD)');
    }
    return this.svc.findRange(ccy, from, to);
  }
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
