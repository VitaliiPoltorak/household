import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Audit } from '@household/audit';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@ApiTags('Accounts')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('accounts')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an account' })
  create(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Body() dto: CreateAccountDto,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.create(householdId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active accounts' })
  findAll(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.findAll(householdId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get accounts summary with total balance' })
  getSummary(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.getSummary(householdId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by id' })
  findOne(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('id') id: string,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.findOne(id, householdId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account' })
  update(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    this.requireContext(userId, householdId);
    return this.svc.update(id, householdId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'finance.account.delete', resourceType: 'account', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Archive account (soft delete)' })
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
