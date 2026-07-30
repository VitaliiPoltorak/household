import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, Query, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto, CreateTransferDto, UpdateTransactionDto } from './dto/transaction.dto';

@ApiTags('Transactions')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a transaction' })
  create(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.create(householdId, userId, dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Create a transfer between accounts' })
  createTransfer(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Body() dto: CreateTransferDto,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.createTransfer(householdId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List transactions with optional filters' })
  @ApiQuery({ name: 'type', enum: TransactionType, required: false })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string YYYY-MM-DD' })
  findAll(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Query('type') type?: TransactionType,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.findAll(householdId, { type, accountId, categoryId, from, to });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by id' })
  findOne(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('id') id: string,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.findOne(id, householdId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update transaction metadata (description, date, category, income source)' })
  update(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.update(id, householdId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete transaction and reverse balance effect' })
  remove(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('id') id: string,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.remove(id, householdId);
  }

  private requireContext(userId: string | undefined, householdId: string | undefined): asserts userId is string {
    if (!userId || !householdId) throw new UnauthorizedException('Missing X-User-Id or X-Household-Id header');
  }
}
