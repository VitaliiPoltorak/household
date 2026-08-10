import { Controller, Post, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Audit } from '@household/audit';
import { InvitesService } from '../households/invites.service';

@ApiTags('Invites')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-user-email', required: true })
@Controller('invites')
export class InvitesController {
  constructor(private readonly svc: InvitesService) {}

  @Post(':token/accept')
  @Audit({ action: 'household.invite.accept', resourceType: 'invite' })
  @ApiOperation({ summary: 'Accept household invite' })
  accept(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-email') userEmail: string,
    @Param('token') token: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
    if (!userEmail) throw new UnauthorizedException('Missing X-User-Email header');
    return this.svc.accept(token, userId, userEmail);
  }
}
