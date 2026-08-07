import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { HouseholdMember } from './entities/household-member.entity';
import { MemberRole, canManage, canGrant } from './entities/member-role.enum';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

/**
 * Owns membership queries, role changes, and the role guards used by every
 * other concern in this module. Extracted from HouseholdsService (issue #89)
 * so that member-row writes have a single writer and permission checks live
 * in one place.
 */
@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(HouseholdMember)
    private readonly memberRepo: Repository<HouseholdMember>,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async list(householdId: string, actorId: string): Promise<HouseholdMember[]> {
    await this.requireMember(householdId, actorId);
    return this.memberRepo.find({ where: { householdId }, order: { createdAt: 'ASC' } });
  }

  /**
   * Returns all memberships for a user across households. Used by
   * HouseholdsService.findUserHouseholds so household CRUD does not touch the
   * member repo directly.
   */
  async findByUserId(userId: string): Promise<HouseholdMember[]> {
    return this.memberRepo.find({ where: { userId } });
  }

  /**
   * Non-throwing membership lookup. Used by InvitesService.accept to detect
   * an already-joined user without triggering the ForbiddenException path.
   */
  async findMembership(householdId: string, userId: string): Promise<HouseholdMember | null> {
    return this.memberRepo.findOne({ where: { householdId, userId } });
  }

  async updateRole(
    householdId: string,
    actorId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<HouseholdMember> {
    const actor = await this.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);
    const target = await this.memberRepo.findOne({ where: { id: memberId, householdId } });
    if (!target) throw new NotFoundException('Member not found');
    if (!canManage(actor.role, target.role)) throw new ForbiddenException('Insufficient role');
    if (dto.role === MemberRole.OWNER) throw new ForbiddenException('Cannot assign owner role');
    // Prevent peer-level elevation: an ADMIN must not be able to promote a
    // MEMBER to ADMIN. canManage already blocks touching someone above you;
    // canGrant blocks handing out a role equal to your own.
    if (!canGrant(actor.role, dto.role)) throw new ForbiddenException('Cannot grant a role equal to or above your own');
    await this.memberRepo.update(memberId, { role: dto.role });
    return this.memberRepo.findOneOrFail({ where: { id: memberId } });
  }

  async remove(householdId: string, actorId: string, memberId: string): Promise<void> {
    const actor = await this.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);
    const target = await this.memberRepo.findOne({ where: { id: memberId, householdId } });
    if (!target) throw new NotFoundException('Member not found');
    if (!canManage(actor.role, target.role)) throw new ForbiddenException('Insufficient role');
    await this.memberRepo.delete(memberId);
    await this.events.emit(
      'household.member.removed',
      { householdId, removedUserId: target.userId },
      { userId: actorId, householdId },
    );
  }

  /**
   * Single writer for HouseholdMember rows. Called by HouseholdsService.create
   * (owner seed) and InvitesService.accept (joiner).
   */
  async add(householdId: string, userId: string, role: MemberRole): Promise<HouseholdMember> {
    return this.memberRepo.save(
      this.memberRepo.create({ householdId, userId, role }),
    );
  }

  async requireMember(householdId: string, userId: string): Promise<HouseholdMember> {
    const member = await this.memberRepo.findOne({ where: { householdId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this household');
    return member;
  }

  async requireRole(
    householdId: string,
    userId: string,
    roles: MemberRole[],
  ): Promise<HouseholdMember> {
    const member = await this.requireMember(householdId, userId);
    if (!roles.includes(member.role)) throw new ForbiddenException('Insufficient role');
    return member;
  }
}
