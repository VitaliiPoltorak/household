import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Headers, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { HouseholdsService } from './households.service';
import { MembersService } from './members.service';
import { InvitesService } from './invites.service';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@ApiTags('Households')
@ApiHeader({ name: 'x-user-id', required: true })
@Controller('households')
export class HouseholdsController {
  constructor(
    private readonly households: HouseholdsService,
    private readonly members: MembersService,
    private readonly invites: InvitesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a household' })
  create(@Headers('x-user-id') userId: string, @Body() dto: CreateHouseholdDto) {
    this.requireUser(userId);
    return this.households.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my households' })
  findAll(@Headers('x-user-id') userId: string) {
    this.requireUser(userId);
    return this.households.findUserHouseholds(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get household details' })
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    this.requireUser(userId);
    return this.households.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update household (admin+)' })
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHouseholdDto,
  ) {
    this.requireUser(userId);
    return this.households.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete household (owner only)' })
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    this.requireUser(userId);
    return this.households.remove(id, userId);
  }

  // --- Members ---

  @Get(':id/members')
  @ApiOperation({ summary: 'List members' })
  getMembers(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    this.requireUser(userId);
    return this.members.list(id, userId);
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({ summary: 'Update member role (admin+)' })
  updateMemberRole(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    this.requireUser(userId);
    return this.members.updateRole(id, userId, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove member (admin+)' })
  removeMember(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    this.requireUser(userId);
    return this.members.remove(id, userId, memberId);
  }

  // --- Invites ---

  @Post(':id/invites')
  @ApiOperation({ summary: 'Invite member by email (admin+)' })
  createInvite(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateInviteDto,
  ) {
    this.requireUser(userId);
    return this.invites.create(id, userId, dto);
  }

  @Get(':id/invites')
  @ApiOperation({ summary: 'List active invites (admin+)' })
  getInvites(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    this.requireUser(userId);
    return this.invites.list(id, userId);
  }

  @Delete(':id/invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke invite (admin+)' })
  deleteInvite(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    this.requireUser(userId);
    return this.invites.delete(id, userId, inviteId);
  }

  private requireUser(userId: string | undefined): asserts userId is string {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
  }
}
