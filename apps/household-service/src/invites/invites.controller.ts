import { Controller, Post, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { HouseholdsService } from '../households/households.service';

@ApiTags('Invites')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-user-email', required: true })
@Controller('invites')
export class InvitesController {
  constructor(private readonly svc: HouseholdsService) {}

  @Post(':token/accept')
  @ApiOperation({ summary: 'Accept household invite' })
  accept(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-email') userEmail: string,
    @Param('token') token: string,
  ) {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
    if (!userEmail) throw new UnauthorizedException('Missing X-User-Email header');
    return this.svc.acceptInvite(token, userId, userEmail);
  }
}
