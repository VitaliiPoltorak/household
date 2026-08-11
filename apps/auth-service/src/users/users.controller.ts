import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

/**
 * Public user directory for the SPA.
 *
 * Why user-scoped (not household-scoped): the household service returns member
 * rows keyed by `userId` UUIDs and the SPA needs a display name + avatar to
 * render each row. Making callers pass a `householdId` here doesn't gain any
 * confidentiality — a household admin already has every userId of every
 * member via `GET /households/:id/members`. Restricting further would only
 * push the SPA to leak the raw UUID in the UI.
 *
 * Trade-off: an authenticated user CAN resolve any userId to a name/avatar.
 * That's the same information visible on any invite / member list they can
 * access. No sensitive fields (email, provider ids, locale, timestamps) are
 * exposed.
 *
 * Rate limiting: relies on the api-gateway's global Redis throttler. The
 * per-request DB cost is a single `IN (…)` query capped at 50 ids.
 */
const MAX_IDS = 50;
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PublicUserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

@ApiTags('Users')
@Controller('auth/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Bulk lookup of public user profiles by id (auth required)',
  })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiQuery({
    name: 'ids',
    required: true,
    description: `Comma-separated list of user UUIDs (max ${MAX_IDS}).`,
    example: 'a1b2c3d4-…,…',
  })
  async getByIds(
    @Headers('x-user-id') userId: string,
    @Query('ids') idsParam?: string,
  ): Promise<PublicUserProfile[]> {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');

    const ids = parseIds(idsParam);
    if (ids.length === 0) return [];
    if (ids.length > MAX_IDS) {
      throw new BadRequestException(
        `Too many ids: cap is ${MAX_IDS}, received ${ids.length}`,
      );
    }
    for (const id of ids) {
      if (!UUID_V4_RE.test(id)) {
        throw new BadRequestException(`Invalid uuid: "${id}"`);
      }
    }

    const users = await this.users.findByIds(ids);
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    }));
  }
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
