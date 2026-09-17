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
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Audit } from '@household/audit';
import { RequireFeature } from '@household/feature-flags';
import { BankConnectionsService } from './bank-connections.service';
import { SyncService } from './sync.service';
import { ConnectMonobankDto } from './dto/connect-monobank.dto';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';
import { BankAccountResponseDto } from './dto/bank-account-response.dto';
import { SetAccountSyncEnabledDto } from './dto/set-account-sync-enabled.dto';
import type { MonobankWebhookEvent } from '../monobank/monobank-client.service';

// Only the routes that actually call out to Monobank (connect, sync,
// webhook-enable) or receive its pushes (webhook delivery) are gated behind
// the 'monobank-integration' kill-switch. GET routes and DELETE deliberately
// are not: reads render existing state (never a misleading empty list) and
// disconnecting/disabling-webhook are things a user should still be able to
// do during an incident.
@ApiTags('Monobank')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('monobank')
export class BankConnectionsController {
  private readonly logger = new Logger(BankConnectionsController.name);

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

  // Registers our public callback with Monobank (#292) — 400 if no public
  // URL is configured (MONOBANK_WEBHOOK_BASE_URL unset, the local-dev
  // default). Gated same as connect/sync: it's the route that calls out to
  // Monobank.
  @Post('connections/:id/webhook')
  @RequireFeature('monobank-integration')
  @Audit({
    action: 'integration.monobank.webhook.enable',
    resourceType: 'bank_connection',
    resourceIdParam: 'id',
  })
  async enableWebhook(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
  ) {
    this.require(hid);
    const connection = await this.svc.enableWebhook(id, hid);
    const accounts = await this.svc.findAccounts(connection.id, hid);
    return BankConnectionResponseDto.from(connection, accounts);
  }

  // Not gated by @RequireFeature: turning real-time off must stay available
  // even mid-incident, same reasoning as DELETE .../connections/:id.
  @Delete('connections/:id/webhook')
  @Audit({
    action: 'integration.monobank.webhook.disable',
    resourceType: 'bank_connection',
    resourceIdParam: 'id',
  })
  async disableWebhook(
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
  ) {
    this.require(hid);
    const connection = await this.svc.disableWebhook(id, hid);
    const accounts = await this.svc.findAccounts(connection.id, hid);
    return BankConnectionResponseDto.from(connection, accounts);
  }

  // Monobank's own check that our callback URL is live before it accepts a
  // POST /personal/webhook registration — made once, synchronously, from
  // inside BankConnectionsService.enableWebhook(). Public: Monobank carries
  // no JWT/household context, only the path secret.
  @Get('webhook/:connectionId/:secret')
  @ApiExcludeEndpoint()
  async verifyWebhook(
    @Param('connectionId') connectionId: string,
    @Param('secret') secret: string,
  ) {
    await this.requireWebhookConnection(connectionId, secret);
    return { ok: true };
  }

  // Delivery of a single Monobank `StatementItem` push (#292). Must stay
  // fast and idempotent: Monobank retries a non-200/timeout at +60s and
  // +600s with a 5s timeout, and the upsert this calls into is already
  // keyed on (connectionId, externalId) so a retried delivery is a no-op.
  @Post('webhook/:connectionId/:secret')
  @HttpCode(HttpStatus.OK)
  @RequireFeature('monobank-integration')
  @ApiExcludeEndpoint()
  async receiveWebhook(
    @Param('connectionId') connectionId: string,
    @Param('secret') secret: string,
    @Body() event: MonobankWebhookEvent,
  ) {
    const connection = await this.requireWebhookConnection(
      connectionId,
      secret,
    );
    if (event?.type !== 'StatementItem' || !event.data?.statementItem) {
      // Acknowledge rather than 4xx: an unrecognized event type is not a
      // delivery failure, and a 4xx would make Monobank retry it forever.
      return { ok: true };
    }
    await this.sync.applyWebhookEvent(
      connection,
      event.data.account,
      event.data.statementItem,
    );
    return { ok: true };
  }

  // Shared by both webhook routes: uniform 404 whether the connection id is
  // unknown, malformed, or the secret doesn't match — never distinguishing
  // those cases in the response, so a probing request can't tell a real
  // connection id from a wrong one.
  private async requireWebhookConnection(connectionId: string, secret: string) {
    const connection = await this.svc.findForWebhook(connectionId);
    if (!connection || !this.svc.verifyWebhookSecret(connection, secret)) {
      this.logger.warn(
        `Rejected webhook call for connection ${connectionId}: unknown connection or bad secret`,
      );
      throw new NotFoundException();
    }
    return connection;
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
