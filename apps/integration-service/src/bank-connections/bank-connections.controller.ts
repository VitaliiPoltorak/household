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
import { Audit } from '@household/audit';
import { RequireFeature } from '@household/feature-flags';
import { BankConnectionsService } from './bank-connections.service';
import { SyncService } from './sync.service';
import { ConnectMonobankDto } from './dto/connect-monobank.dto';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';

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
    return BankConnectionResponseDto.from(connection);
  }

  @Get('connections')
  async findAll(@Headers('x-household-id') hid: string) {
    this.require(hid);
    const connections = await this.svc.findAll(hid);
    return connections.map(BankConnectionResponseDto.from);
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

  @Post('connections/:id/sync')
  @RequireFeature('monobank-integration')
  async triggerSync(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
  ) {
    this.require(hid);
    return this.sync.sync(id, hid);
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
