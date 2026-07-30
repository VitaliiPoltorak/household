import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';

@ApiTags('Stores')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('stores')
export class StoresController {
  constructor(private readonly svc: StoresService) {}

  @Post()
  create(@Headers('x-household-id') hid: string, @Body() dto: CreateStoreDto) {
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
  update(@Headers('x-household-id') hid: string, @Param('id') id: string, @Body() dto: UpdateStoreDto) {
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
