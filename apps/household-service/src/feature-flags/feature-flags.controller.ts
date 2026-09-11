import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '@household/audit';
import { MemberRole } from '../households/entities/member-role.enum';
import { MembersService } from '../households/members.service';
import { FeatureFlagsService } from './feature-flags.service';
import { SetHouseholdOverrideDto } from './dto/set-household-override.dto';

@ApiTags('Feature Flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly members: MembersService,
  ) {}

  @Get()
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiOperation({ summary: 'Resolved value of every flag for the caller' })
  resolveAll(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId?: string,
  ) {
    this.requireUser(userId);
    return this.flags.resolveAll({ userId, householdId });
  }

  // Primarily internal — called by @household/feature-flags'
  // FeatureFlagClientService directly against HOUSEHOLD_SERVICE_URL, not
  // through the gateway. It IS also reachable via the gateway's generic
  // /api/v1/feature-flags proxy prefix (routes.default.json has no
  // per-subpath exclusion), so it can't rely on "unproxied" as its security
  // boundary. Both headers are optional: a caller resolving only the global
  // default (no actor context) sends neither. When both are present we
  // still verify membership — the gateway forwards X-Household-Id from the
  // client unverified (CLAUDE.md's multi-tenancy note), so without this
  // check an authenticated user could probe another household's override
  // state by spoofing the header, same IDOR shape every other
  // household-scoped route in this service already guards against.
  @Get(':flagKey/state')
  @ApiOperation({
    summary: 'Raw per-actor state (internal use by @household/feature-flags)',
  })
  async getState(
    @Param('flagKey') flagKey: string,
    @Headers('x-user-id') userId?: string,
    @Headers('x-household-id') householdId?: string,
  ) {
    if (userId && householdId) {
      await this.members.requireMember(householdId, userId);
    }
    return this.flags.getRawState(flagKey, { userId, householdId });
  }

  @Put(':flagKey/household-override')
  @Audit({
    action: 'household.feature-flag.toggle',
    resourceType: 'feature-flag',
    resourceIdParam: 'flagKey',
  })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-household-id', required: true })
  @ApiOperation({
    summary: 'Set a household-scoped override (owner/admin only)',
  })
  async setHouseholdOverride(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('flagKey') flagKey: string,
    @Body() dto: SetHouseholdOverrideDto,
  ) {
    this.requireUser(userId);
    this.requireHousehold(householdId);
    await this.members.requireRole(householdId, userId, [
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);
    await this.flags.setHouseholdOverride(flagKey, householdId, dto.enabled);
  }

  @Delete(':flagKey/household-override')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'household.feature-flag.clear_override',
    resourceType: 'feature-flag',
    resourceIdParam: 'flagKey',
  })
  @ApiHeader({ name: 'x-user-id', required: true })
  @ApiHeader({ name: 'x-household-id', required: true })
  @ApiOperation({
    summary: 'Revert a household back to the global default (owner/admin only)',
  })
  async clearHouseholdOverride(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') householdId: string,
    @Param('flagKey') flagKey: string,
  ) {
    this.requireUser(userId);
    this.requireHousehold(householdId);
    await this.members.requireRole(householdId, userId, [
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);
    await this.flags.clearHouseholdOverride(flagKey, householdId);
  }

  private requireUser(userId: string | undefined): asserts userId is string {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
  }

  private requireHousehold(
    householdId: string | undefined,
  ): asserts householdId is string {
    if (!householdId)
      throw new UnauthorizedException('Missing X-Household-Id header');
  }
}
