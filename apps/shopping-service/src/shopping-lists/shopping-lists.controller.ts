import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, Query, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { ShoppingListsService } from './shopping-lists.service';
import { ListStatus } from './entities/shopping-list.entity';
import {
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateItemDto, UpdateItemDto,
} from './dto/shopping-list.dto';

@ApiTags('Shopping Lists')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('shopping-lists')
export class ShoppingListsController {
  constructor(private readonly svc: ShoppingListsService) {}

  @Post()
  create(
    @Headers('x-user-id') uid: string,
    @Headers('x-household-id') hid: string,
    @Body() dto: CreateShoppingListDto,
  ) {
    this.require(uid, hid);
    return this.svc.create(hid, uid, dto);
  }

  @Get()
  @ApiQuery({ name: 'status', enum: ListStatus, required: false })
  findAll(
    @Headers('x-household-id') hid: string,
    @Query('status') status?: ListStatus,
  ) {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
    return this.svc.findAll(hid, status);
  }

  @Get(':id')
  findOne(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
    return this.svc.findOne(id, hid);
  }

  @Patch(':id')
  update(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
    @Body() dto: UpdateShoppingListDto,
  ) {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
    return this.svc.update(id, hid, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
    return this.svc.remove(id, hid);
  }

  @Post(':id/complete')
  complete(
    @Headers('x-user-id') uid: string,
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
  ) {
    this.require(uid, hid);
    return this.svc.complete(id, hid, uid);
  }

  @Post(':id/items')
  addItem(
    @Headers('x-user-id') uid: string,
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
    @Body() dto: CreateItemDto,
  ) {
    this.require(uid, hid);
    return this.svc.addItem(id, hid, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Headers('x-user-id') uid: string,
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    this.require(uid, hid);
    return this.svc.updateItem(id, itemId, hid, dto, uid);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
    return this.svc.removeItem(id, itemId, hid);
  }

  private require(uid: string, hid: string): void {
    if (!uid || !hid) throw new UnauthorizedException('Missing required headers');
  }
}
