import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { IncomeSourcesService } from './income-sources.service';
import { CreateIncomeSourceDto, UpdateIncomeSourceDto } from './dto/income-source.dto';

@ApiTags('Income Sources')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('income-sources')
export class IncomeSourcesController {
  constructor(private readonly svc: IncomeSourcesService) {}

  @Post()
  create(@Headers('x-household-id') hid: string, @Body() dto: CreateIncomeSourceDto) {
    this.require(hid);
    return this.svc.create(hid, dto);
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
  update(@Headers('x-household-id') hid: string, @Param('id') id: string, @Body() dto: UpdateIncomeSourceDto) {
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
