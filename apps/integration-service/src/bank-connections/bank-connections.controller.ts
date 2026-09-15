import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { Audit } from '@household/audit';
import { RequireFeature } from '@household/feature-flags';
import { BankConnectionsService } from './bank-connections.service';
import { SyncService } from './sync.service';
import { ConnectMonobankDto } from './dto/connect-monobank.dto';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';
import { BankAccountResponseDto } from './dto/bank-account-response.dto';
import { SetAccountSyncEnabledDto } from './dto/set-account-sync-enabled.dto';

// Only the two routes that actually call out to Monobank
// (connect + sync) are gated behind the 'monobank-integration' kill-switch.
// GET routes and DELETE deliberately are not: reads render existing state
// (never a misleading empty list) and disconnecting is the one thing a user
// should still be able to do during an incident.
@ApiTags('Monobank')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('monobank')
export class BankConnectionsController {
  constructor(
    private readonly svc: BankConnectionsService,
    private readonly sync: SyncService,
  ) {}

  @Post('connect')
  @RequireFeature('monobank-integration')
  @Audit({
    action: 'integration.monobank.connect',
    resourceType: 'bank_connection',
  })
  async connect(
    @Headers('x-household-id') hid: string,
    @Body() dto: ConnectMonobankDto,
  ) {
    this.require(hid);
    const connection = await this.svc.connect(hid, dto);
    const accounts = await this.svc.findAccounts(connection.id, hid);
    return BankConnectionResponseDto.from(connection, accounts);
  }

  @Get('connections')
  async findAll(@Headers('x-household-id') hid: string) {
    this.require(hid);
    const connections = await this.svc.findAll(hid);
    const accountsByConnection = await this.svc.findAccountsGrouped(
      connections.map((c) => c.id),
    );
    return connections.map((c) =>
      BankConnectionResponseDto.from(c, accountsByConnection.get(c.id) ?? []),
    );
  }

  @Delete('connections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'integration.monobank.disconnect',
    resourceType: 'bank_connection',
    resourceIdParam: 'id',
  })
  remove(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.remove(id, hid);
  }

  @Patch('connections/:id/accounts/:accountId')
  async setAccountSyncEnabled(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() dto: SetAccountSyncEnabledDto,
  ) {
    this.require(hid);
    const account = await this.svc.setAccountSyncEnabled(
      id,
      accountId,
      hid,
      dto.enabled,
    );
    return BankAccountResponseDto.from(account);
  }

  // Accepts the request and returns immediately (#293) — SyncScheduler does
  // the actual Monobank calls in the background, one account per 60s tick.
  @Post('connections/:id/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireFeature('monobank-integration')
  async triggerSync(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
  ) {
    this.require(hid);
    return this.sync.enqueue(id, hid);
  }

  @Get('connections/:id/logs')
  getLogs(@Headers('x-household-id') hid: string, @Param('id') id: string) {
    this.require(hid);
    return this.svc.getLogs(id, hid);
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
