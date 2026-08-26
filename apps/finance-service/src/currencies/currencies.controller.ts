import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import { EnableCurrencyDto } from './dto/currency.dto';

@ApiTags('Currencies')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly svc: CurrenciesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get('enabled')
  findEnabled(@Headers('x-household-id') hid: string) {
    this.require(hid);
    return this.svc.findEnabled(hid);
  }

  @Post('enabled')
  enable(
    @Headers('x-household-id') hid: string,
    @Body() dto: EnableCurrencyDto,
  ) {
    this.require(hid);
    return this.svc.enable(hid, dto.code);
  }

  @Get('enabled/:code/impact')
  getImpact(
    @Headers('x-household-id') hid: string,
    @Param('code') code: string,
  ) {
    this.require(hid);
    return this.svc.getImpact(hid, code.toUpperCase());
  }

  @Delete('enabled/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(@Headers('x-household-id') hid: string, @Param('code') code: string) {
    this.require(hid);
    return this.svc.disable(hid, code.toUpperCase());
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
