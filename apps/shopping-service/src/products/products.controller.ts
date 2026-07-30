import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, Query, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@ApiTags('Products')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Post()
  create(@Headers('x-household-id') hid: string, @Body() dto: CreateProductDto) {
    this.require(hid);
    return this.svc.create(hid, dto);
  }

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  findAll(
    @Headers('x-household-id') hid: string,
    @Query('search') search?: string,
    @Query('storeId') storeId?: string,
  ) {
    this.require(hid);
    return this.svc.findAll(hid, { search, storeId });
  }

  @Get(':id')
  findOne(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.findOne(id, hid);
  }

  @Patch(':id')
  update(@Headers('x-household-id') hid: string, @Param('id') id: string, @Body() dto: UpdateProductDto) {
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
