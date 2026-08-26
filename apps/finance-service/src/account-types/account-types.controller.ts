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
import { AccountTypesService } from './account-types.service';
import { EnableAccountTypeDto } from './dto/account-type.dto';

@ApiTags('Account Types')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('account-types')
export class AccountTypesController {
  constructor(private readonly svc: AccountTypesService) {}

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
    @Body() dto: EnableAccountTypeDto,
  ) {
    this.require(hid);
    return this.svc.enable(hid, dto);
  }

  @Get('enabled/:code/impact')
  getImpact(
    @Headers('x-household-id') hid: string,
    @Param('code') code: string,
  ) {
    this.require(hid);
    return this.svc.getImpact(hid, code.toLowerCase());
  }

  @Delete('enabled/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(@Headers('x-household-id') hid: string, @Param('code') code: string) {
    this.require(hid);
    return this.svc.disable(hid, code.toLowerCase());
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
