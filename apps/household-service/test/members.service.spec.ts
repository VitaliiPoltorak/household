import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembersService } from '../src/households/members.service';
import { MemberRole } from '../src/households/entities/member-role.enum';

/**
 * Unit tests for the guards and role transitions extracted from
 * HouseholdsService in issue #89. Household-service has no integration test
 * infra yet — these tests compensate by covering the pure permission logic
 * that used to be private helpers on HouseholdsService.
 */

type MockRepo = {
  findOne: jest.Mock;
  findOneOrFail: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

function makeRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((o: unknown) => o),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeEventPublisher() {
  return { emit: jest.fn().mockResolvedValue(undefined) };
}

describe('MembersService (unit)', () => {
  const HOUSEHOLD_ID = 'hh-1';
  const ACTOR_ID = 'actor-1';
  const MEMBER_ID = 'member-row-1';
  const TARGET_USER_ID = 'target-user-1';

  let memberRepo: MockRepo;
  let events: ReturnType<typeof makeEventPublisher>;
  let service: MembersService;

  beforeEach(() => {
    memberRepo = makeRepo();
    events = makeEventPublisher();
    service = new MembersService(memberRepo as never, events as never);
  });

  describe('requireMember', () => {
    it('returns the member row when the user is a member', async () => {
      const row = { id: 'x', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.MEMBER };
      memberRepo.findOne.mockResolvedValue(row);

      await expect(service.requireMember(HOUSEHOLD_ID, ACTOR_ID)).resolves.toEqual(row);
      expect(memberRepo.findOne).toHaveBeenCalledWith({
        where: { householdId: HOUSEHOLD_ID, userId: ACTOR_ID },
      });
    });

    it('throws ForbiddenException("Not a member of this household") when not a member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.requireMember(HOUSEHOLD_ID, ACTOR_ID)).rejects.toThrow(
        new ForbiddenException('Not a member of this household'),
      );
    });
  });

  describe('requireRole', () => {
    it('returns the member when the role is in the allowlist', async () => {
      const row = { id: 'x', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.ADMIN };
      memberRepo.findOne.mockResolvedValue(row);

      await expect(
        service.requireRole(HOUSEHOLD_ID, ACTOR_ID, [MemberRole.OWNER, MemberRole.ADMIN]),
      ).resolves.toEqual(row);
    });

    it('throws ForbiddenException("Insufficient role") when the role is not in the allowlist', async () => {
      const row = { id: 'x', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.MEMBER };
      memberRepo.findOne.mockResolvedValue(row);

      await expect(
        service.requireRole(HOUSEHOLD_ID, ACTOR_ID, [MemberRole.OWNER, MemberRole.ADMIN]),
      ).rejects.toThrow(new ForbiddenException('Insufficient role'));
    });

    it('propagates ForbiddenException from requireMember when the user is not a member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.requireRole(HOUSEHOLD_ID, ACTOR_ID, [MemberRole.OWNER]),
      ).rejects.toThrow(new ForbiddenException('Not a member of this household'));
    });
  });

  describe('add', () => {
    it('writes a member row with the specified role', async () => {
      const created = { householdId: HOUSEHOLD_ID, userId: TARGET_USER_ID, role: MemberRole.OWNER };
      memberRepo.save.mockResolvedValue({ id: 'new', ...created });

      const result = await service.add(HOUSEHOLD_ID, TARGET_USER_ID, MemberRole.OWNER);

      expect(memberRepo.create).toHaveBeenCalledWith(created);
      expect(memberRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual({ id: 'new', ...created });
    });
  });

  describe('updateRole', () => {
    it('lets an OWNER demote an ADMIN to MEMBER', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.OWNER };
      const target = { id: MEMBER_ID, householdId: HOUSEHOLD_ID, userId: TARGET_USER_ID, role: MemberRole.ADMIN };
      memberRepo.findOne
        .mockResolvedValueOnce(actor)   // requireRole → requireMember lookup for actor
        .mockResolvedValueOnce(target); // target lookup
      memberRepo.findOneOrFail.mockResolvedValue({ ...target, role: MemberRole.MEMBER });

      const result = await service.updateRole(HOUSEHOLD_ID, ACTOR_ID, MEMBER_ID, { role: MemberRole.MEMBER });

      expect(memberRepo.update).toHaveBeenCalledWith(MEMBER_ID, { role: MemberRole.MEMBER });
      expect(result.role).toBe(MemberRole.MEMBER);
    });

    it('rejects an ADMIN trying to change an OWNER (canManage returns false)', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.ADMIN };
      const target = { id: MEMBER_ID, householdId: HOUSEHOLD_ID, userId: TARGET_USER_ID, role: MemberRole.OWNER };
      memberRepo.findOne
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);

      await expect(
        service.updateRole(HOUSEHOLD_ID, ACTOR_ID, MEMBER_ID, { role: MemberRole.MEMBER }),
      ).rejects.toThrow(new ForbiddenException('Insufficient role'));
      expect(memberRepo.update).not.toHaveBeenCalled();
    });

    it('rejects assigning OWNER role', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.OWNER };
      const target = { id: MEMBER_ID, householdId: HOUSEHOLD_ID, userId: TARGET_USER_ID, role: MemberRole.ADMIN };
      memberRepo.findOne
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);

      await expect(
        service.updateRole(HOUSEHOLD_ID, ACTOR_ID, MEMBER_ID, { role: MemberRole.OWNER }),
      ).rejects.toThrow(new ForbiddenException('Cannot assign owner role'));
      expect(memberRepo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target member does not exist', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.OWNER };
      memberRepo.findOne
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(null);

      await expect(
        service.updateRole(HOUSEHOLD_ID, ACTOR_ID, MEMBER_ID, { role: MemberRole.MEMBER }),
      ).rejects.toThrow(new NotFoundException('Member not found'));
    });
  });

  describe('remove', () => {
    it('deletes the member row and emits household.member.removed with correct payload/meta', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.OWNER };
      const target = { id: MEMBER_ID, householdId: HOUSEHOLD_ID, userId: TARGET_USER_ID, role: MemberRole.MEMBER };
      memberRepo.findOne
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);

      await service.remove(HOUSEHOLD_ID, ACTOR_ID, MEMBER_ID);

      expect(memberRepo.delete).toHaveBeenCalledWith(MEMBER_ID);
      expect(events.emit).toHaveBeenCalledWith(
        'household.member.removed',
        { householdId: HOUSEHOLD_ID, removedUserId: TARGET_USER_ID },
        { userId: ACTOR_ID, householdId: HOUSEHOLD_ID },
      );
    });

    it('rejects when actor cannot manage target and does not emit an event', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.ADMIN };
      const target = { id: MEMBER_ID, householdId: HOUSEHOLD_ID, userId: TARGET_USER_ID, role: MemberRole.OWNER };
      memberRepo.findOne
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(target);

      await expect(service.remove(HOUSEHOLD_ID, ACTOR_ID, MEMBER_ID)).rejects.toThrow(
        new ForbiddenException('Insufficient role'),
      );
      expect(memberRepo.delete).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns member rows for the household after the caller passes requireMember', async () => {
      const actor = { id: 'actor', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.MEMBER };
      const rows = [actor, { id: 'x', householdId: HOUSEHOLD_ID, userId: 'other', role: MemberRole.VIEWER }];
      memberRepo.findOne.mockResolvedValue(actor);
      memberRepo.find.mockResolvedValue(rows);

      await expect(service.list(HOUSEHOLD_ID, ACTOR_ID)).resolves.toEqual(rows);
      expect(memberRepo.find).toHaveBeenCalledWith({
        where: { householdId: HOUSEHOLD_ID },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('findByUserId', () => {
    it('returns all memberships for the given userId', async () => {
      const rows = [
        { id: 'a', householdId: 'hh-a', userId: ACTOR_ID, role: MemberRole.OWNER },
        { id: 'b', householdId: 'hh-b', userId: ACTOR_ID, role: MemberRole.MEMBER },
      ];
      memberRepo.find.mockResolvedValue(rows);

      await expect(service.findByUserId(ACTOR_ID)).resolves.toEqual(rows);
      expect(memberRepo.find).toHaveBeenCalledWith({ where: { userId: ACTOR_ID } });
    });
  });

  describe('findMembership', () => {
    it('returns the row when a membership exists (does not throw)', async () => {
      const row = { id: 'x', householdId: HOUSEHOLD_ID, userId: ACTOR_ID, role: MemberRole.MEMBER };
      memberRepo.findOne.mockResolvedValue(row);

      await expect(service.findMembership(HOUSEHOLD_ID, ACTOR_ID)).resolves.toEqual(row);
    });

    it('returns null when no membership exists (does not throw)', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.findMembership(HOUSEHOLD_ID, ACTOR_ID)).resolves.toBeNull();
    });
  });
});
