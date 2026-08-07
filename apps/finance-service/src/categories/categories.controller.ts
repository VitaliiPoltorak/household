import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, Query, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CategoryType } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('Categories')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('categories')
export class CategoriesController {
  constructor(private readonly svc: CategoriesService) {}

  @Post()
  create(@Headers('x-household-id') hid: string, @Body() dto: CreateCategoryDto) {
    this.require(hid);
    return this.svc.create(hid, dto);
  }

  @Get()
  @ApiQuery({ name: 'type', enum: CategoryType, required: false })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(
    @Headers('x-household-id') hid: string,
    @Query('type') type?: CategoryType,
    @Query('includeArchived') includeArchived?: string,
  ) {
    this.require(hid);
    return this.svc.findAll(hid, type, includeArchived === 'true');
  }

  @Post(':id/unarchive')
  unarchive(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.unarchive(id, hid);
  }

  @Get(':id')
  findOne(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.findOne(id, hid);
  }

  @Get(':id/impact')
  @ApiOperation({ summary: 'Count rows referencing this category (transactions, recurring, subcategories)' })
  getImpact(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.getImpact(id, hid);
  }

  @Patch(':id')
  update(@Headers('x-household-id') hid: string, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
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
