import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { EVENT_PUBLISHER, IEventPublisher, LIST_HARD_LIMIT } from '@household/contracts';
import { Household } from './entities/household.entity';
import { MemberRole } from './entities/member-role.enum';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { MembersService } from './members.service';

/**
 * Owns household CRUD + slug generation. Members/invites logic and the shared
 * role guards live in MembersService / InvitesService (issue #89).
 */
@Injectable()
export class HouseholdsService {
  constructor(
    @InjectRepository(Household)
    private readonly householdRepo: Repository<Household>,
    private readonly members: MembersService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async create(userId: string, dto: CreateHouseholdDto): Promise<Household> {
    const slug = await this.uniqueSlug(dto.name);
    const household = await this.householdRepo.save(
      this.householdRepo.create({ name: dto.name, slug, createdBy: userId }),
    );
    await this.members.add(household.id, userId, MemberRole.OWNER);
    await this.events.emit('household.created', { householdId: household.id }, { userId });
    return household;
  }

  async findUserHouseholds(userId: string): Promise<Household[]> {
    const memberships = await this.members.findByUserId(userId);
    if (!memberships.length) return [];
    const ids = memberships.map((m) => m.householdId);
    return this.householdRepo.find({ where: { id: In(ids) }, order: { name: 'ASC' }, take: LIST_HARD_LIMIT });
  }

  async findOne(householdId: string, userId: string): Promise<Household> {
    await this.members.requireMember(householdId, userId);
    const h = await this.householdRepo.findOne({ where: { id: householdId } });
    if (!h) throw new NotFoundException('Household not found');
    return h;
  }

  async update(householdId: string, userId: string, dto: UpdateHouseholdDto): Promise<Household> {
    await this.members.requireRole(householdId, userId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (dto.name) {
      await this.householdRepo.update(householdId, { name: dto.name });
    }
    return this.findOne(householdId, userId);
  }

  async remove(householdId: string, userId: string): Promise<void> {
    await this.members.requireRole(householdId, userId, [MemberRole.OWNER]);
    await this.householdRepo.delete(householdId);
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
