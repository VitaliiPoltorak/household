import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { InjectRedis } from '../redis/redis.module';
import { KafkaProducerService } from '@household/kafka';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { HouseholdInvite } from './entities/household-invite.entity';
import { MemberRole, canManage } from './entities/member-role.enum';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class HouseholdsService {
  constructor(
    @InjectRepository(Household)
    private readonly householdRepo: Repository<Household>,
    @InjectRepository(HouseholdMember)
    private readonly memberRepo: Repository<HouseholdMember>,
    @InjectRepository(HouseholdInvite)
    private readonly inviteRepo: Repository<HouseholdInvite>,
    @InjectRedis() private readonly redis: Redis,
    private readonly kafka: KafkaProducerService,
  ) {}

  async create(userId: string, dto: CreateHouseholdDto): Promise<Household> {
    const slug = await this.uniqueSlug(dto.name);
    const household = await this.householdRepo.save(
      this.householdRepo.create({ name: dto.name, slug, createdBy: userId }),
    );
    await this.memberRepo.save(
      this.memberRepo.create({ householdId: household.id, userId, role: MemberRole.OWNER }),
    );
    await this.kafka.emit('household.created', { householdId: household.id }, { userId });
    return household;
  }

  async findUserHouseholds(userId: string): Promise<Household[]> {
    const memberships = await this.memberRepo.find({ where: { userId } });
    if (!memberships.length) return [];
    const ids = memberships.map((m) => m.householdId);
    return this.householdRepo.find({ where: { id: In(ids) }, order: { name: 'ASC' } });
  }

  async findOne(householdId: string, userId: string): Promise<Household> {
    await this.requireMember(householdId, userId);
    const h = await this.householdRepo.findOne({ where: { id: householdId } });
    if (!h) throw new NotFoundException('Household not found');
    return h;
  }

  async update(householdId: string, userId: string, dto: UpdateHouseholdDto): Promise<Household> {
    await this.requireRole(householdId, userId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (dto.name) {
      await this.householdRepo.update(householdId, { name: dto.name });
    }
    return this.findOne(householdId, userId);
  }

  async remove(householdId: string, userId: string): Promise<void> {
    await this.requireRole(householdId, userId, [MemberRole.OWNER]);
    await this.householdRepo.delete(householdId);
  }

  // --- Members ---

  async getMembers(householdId: string, userId: string): Promise<HouseholdMember[]> {
    await this.requireMember(householdId, userId);
    return this.memberRepo.find({ where: { householdId }, order: { createdAt: 'ASC' } });
  }

  async updateMemberRole(
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
    await this.memberRepo.update(memberId, { role: dto.role });
    return this.memberRepo.findOneOrFail({ where: { id: memberId } });
  }

  async removeMember(householdId: string, actorId: string, memberId: string): Promise<void> {
    const actor = await this.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);
    const target = await this.memberRepo.findOne({ where: { id: memberId, householdId } });
    if (!target) throw new NotFoundException('Member not found');
    if (!canManage(actor.role, target.role)) throw new ForbiddenException('Insufficient role');
    await this.memberRepo.delete(memberId);
    await this.kafka.emit(
      'household.member.removed',
      { householdId, removedUserId: target.userId },
      { userId: actorId, householdId },
    );
  }

  // --- Invites ---

  async createInvite(
    householdId: string,
    actorId: string,
    dto: CreateInviteDto,
  ): Promise<HouseholdInvite> {
    await this.requireRole(householdId, actorId, [MemberRole.OWNER, MemberRole.ADMIN]);

    const existing = await this.memberRepo.findOne({
      where: { householdId },
    });
    if (existing) {
      // Check by email is not straightforward without user service; skip for now
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000);
    const role = dto.role ?? MemberRole.MEMBER;

    const invite = await this.inviteRepo.save(
      this.inviteRepo.create({ householdId, email: dto.email, token, role, expiresAt, acceptedAt: null }),
    );

    await this.redis.set(
      `invite:${token}`,
      JSON.stringify({ householdId, email: dto.email, role }),
      'EX',
      INVITE_TTL_DAYS * 86400,
    );

    await this.kafka.emit(
      'household.member.invited',
      { householdId, email: dto.email, role, token },
      { userId: actorId, householdId },
    );

    return invite;
  }

  async getInvites(householdId: string, userId: string): Promise<HouseholdInvite[]> {
    await this.requireRole(householdId, userId, [MemberRole.OWNER, MemberRole.ADMIN]);
    return this.inviteRepo.find({
      where: { householdId, acceptedAt: undefined, expiresAt: MoreThan(new Date()) },
    });
  }

  async deleteInvite(householdId: string, userId: string, inviteId: string): Promise<void> {
    await this.requireRole(householdId, userId, [MemberRole.OWNER, MemberRole.ADMIN]);
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, householdId } });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.inviteRepo.delete(inviteId);
    await this.redis.del(`invite:${invite.token}`);
  }

  async acceptInvite(token: string, userId: string, userEmail: string): Promise<HouseholdMember> {
    const invite = await this.inviteRepo.findOne({ where: { token } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.acceptedAt) throw new ConflictException('Invite already used');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('Invite expired');
    }
    if (invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException('Invite email does not match your account');
    }

    const existing = await this.memberRepo.findOne({
      where: { householdId: invite.householdId, userId },
    });
    if (existing) throw new ConflictException('Already a member');

    const member = await this.memberRepo.save(
      this.memberRepo.create({ householdId: invite.householdId, userId, role: invite.role }),
    );

    await this.inviteRepo.update(invite.id, { acceptedAt: new Date() });
    await this.redis.del(`invite:${token}`);

    await this.kafka.emit(
      'household.member.joined',
      { householdId: invite.householdId, userId, role: invite.role },
      { userId, householdId: invite.householdId },
    );

    return member;
  }

  // --- Helpers ---

  private async requireMember(householdId: string, userId: string): Promise<HouseholdMember> {
    const member = await this.memberRepo.findOne({ where: { householdId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this household');
    return member;
  }

  private async requireRole(
    householdId: string,
    userId: string,
    roles: MemberRole[],
  ): Promise<HouseholdMember> {
    const member = await this.requireMember(householdId, userId);
    if (!roles.includes(member.role)) throw new ForbiddenException('Insufficient role');
    return member;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = `${base}-${randomUUID().slice(0, 8)}`;
    while (await this.householdRepo.findOne({ where: { slug } })) {
      slug = `${base}-${randomUUID().slice(0, 8)}`;
    }
    return slug;
  }
}
