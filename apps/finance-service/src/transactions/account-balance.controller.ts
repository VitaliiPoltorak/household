import {
  Controller, Post, Param, Body, Headers, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { AccountsService } from '../accounts/accounts.service';
import { AdjustBalanceDto } from '../accounts/dto/account.dto';

@ApiTags('Accounts')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('accounts')
export class AccountBalanceController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly accounts: AccountsService,
  ) {}

  @Post(':id/adjust-balance')
  @ApiOperation({ summary: 'Manually adjust account balance — creates a signed ADJUSTMENT transaction' })
  async adjustBalance(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('id') accountId: string,
    @Body() dto: AdjustBalanceDto,
  ) {
    if (!userId || !householdId) throw new UnauthorizedException('Missing X-User-Id or X-Household-Id header');

    const account = await this.accounts.findOne(accountId, householdId);
    const delta = Number(dto.newBalance) - Number(account.balance);

    if (delta === 0) {
      throw new BadRequestException('New balance is equal to current balance');
    }

    return this.transactions.createAdjustment(
      householdId,
      userId,
      accountId,
      delta,
      dto.description,
      dto.date,
    );
  }
}
