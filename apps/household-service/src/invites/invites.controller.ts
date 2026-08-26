import {
  Controller,
  Get,
  Post,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Audit } from '@household/audit';
import { InvitesService } from '../households/invites.service';

@ApiTags('Invites')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-user-email', required: true })
@Controller('invites')
export class InvitesController {
  constructor(private readonly svc: InvitesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active invites addressed to the current user',
  })
  listMine(@Headers('x-user-email') userEmail: string) {
    if (!userEmail)
      throw new UnauthorizedException('Missing X-User-Email header');
    return this.svc.listForUser(userEmail);
  }

  @Post(':token/accept')
  @Audit({ action: 'household.invite.accept', resourceType: 'invite' })
  @ApiOperation({ summary: 'Accept household invite' })
  accept(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-email') userEmail: string,
    @Param('token') token: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
    if (!userEmail)
      throw new UnauthorizedException('Missing X-User-Email header');
    return this.svc.accept(token, userId, userEmail);
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'household.invite.decline', resourceType: 'invite' })
  @ApiOperation({ summary: 'Decline household invite' })
  decline(
    @Headers('x-user-email') userEmail: string,
    @Param('token') token: string,
  ) {
    if (!userEmail)
      throw new UnauthorizedException('Missing X-User-Email header');
    return this.svc.decline(token, userEmail);
  }
}
