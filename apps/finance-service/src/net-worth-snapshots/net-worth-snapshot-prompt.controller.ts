import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  NetWorthSnapshotPromptService,
  SnapshotPromptState,
} from './net-worth-snapshot-prompt.service';

/**
 * Month-end "have all incomes been entered?" prompt (#406). Like the rest of
 * finance-service, role enforcement is not done here (the gateway forwards no
 * role); the web hides the bar from viewers.
 */
@ApiTags('Reports')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('reports/net-worth/snapshot-prompt')
export class NetWorthSnapshotPromptController {
  constructor(private readonly svc: NetWorthSnapshotPromptService) {}

  @Get()
  get(@Headers('x-household-id') hid: string): Promise<SnapshotPromptState> {
    this.require(hid);
    return this.svc.getState(hid);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Headers('x-household-id') hid: string,
    @Headers('x-user-id') userId?: string,
  ): Promise<SnapshotPromptState> {
    this.require(hid);
    return this.svc.confirm(hid, userId);
  }

  @Post('snooze')
  @HttpCode(HttpStatus.OK)
  snooze(
    @Headers('x-household-id') hid: string,
    @Headers('x-user-id') userId?: string,
  ): Promise<SnapshotPromptState> {
    this.require(hid);
    return this.svc.snooze(hid, userId);
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
