import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { InjectRedis } from '../redis/redis.module';
import { EVENT_PUBLISHER, IEventPublisher, LIST_HARD_LIMIT } from '@household/contracts';
import { HouseholdInvite } from './entities/household-invite.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { MemberRole, canGrant } from './entities/member-role.enum';
import { CreateInviteDto } from './dto/create-invite.dto';
import { MembersService } from './members.service';

const INVITE_TTL_DAYS = 7;

/**
 * Owns the invite lifecycle (create / list / delete / accept). Redis-backed
 * with a 7-day TTL. Extracted from HouseholdsService (issue #89). Delegates
 * membership creation on accept to MembersService.add so member writes stay
 * in a single place.
 */
@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(HouseholdInvite)
    private readonly inviteRepo: Repository<HouseholdInvite>,
    private readonly members: MembersService,
    @InjectRedis() private readonly redis: Redis,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async create(
    householdId: string,
    actorId: string,
    dto: CreateInviteDto,
  ): Promise<HouseholdInvite> {
    const actor = await this.members.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000);
    const role = dto.role ?? MemberRole.MEMBER;

    // Prevent peer-level elevation: an ADMIN must not be able to invite
    // another ADMIN (or an OWNER). Only OWNER can grant ADMIN.
    if (!canGrant(actor.role, role)) {
      throw new ForbiddenException('Cannot grant a role equal to or above your own');
    }

    const invite = await this.inviteRepo.save(
      this.inviteRepo.create({ householdId, email: dto.email, token, role, expiresAt, acceptedAt: null }),
    );

    await this.redis.set(
      `invite:${token}`,
      JSON.stringify({ householdId, email: dto.email, role }),
      'EX',
      INVITE_TTL_DAYS * 86400,
    );

    await this.events.emit(
      'household.member.invited',
      { householdId, email: dto.email, role, token },
      { userId: actorId, householdId },
    );

    return invite;
  }

  async list(householdId: string, actorId: string): Promise<HouseholdInvite[]> {
    await this.members.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);
    return this.inviteRepo.find({
      where: { householdId, acceptedAt: undefined, expiresAt: MoreThan(new Date()) },
      take: LIST_HARD_LIMIT,
    });
  }

  async delete(householdId: string, actorId: string, inviteId: string): Promise<void> {
    await this.members.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, householdId } });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.inviteRepo.delete(inviteId);
    await this.redis.del(`invite:${invite.token}`);
  }

  async accept(token: string, userId: string, userEmail: string): Promise<HouseholdMember> {
    const invite = await this.inviteRepo.findOne({ where: { token } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.acceptedAt) throw new ConflictException('Invite already used');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('Invite expired');
    }
    if (invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException('Invite email does not match your account');
    }

    const existing = await this.members.findMembership(invite.householdId, userId);
    if (existing) throw new ConflictException('Already a member');

    const member = await this.members.add(invite.householdId, userId, invite.role);

    await this.inviteRepo.update(invite.id, { acceptedAt: new Date() });
    await this.redis.del(`invite:${token}`);

    await this.events.emit(
      'household.member.joined',
      { householdId: invite.householdId, userId, role: invite.role },
      { userId, householdId: invite.householdId },
    );

    return member;
  }
}
