import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvitesService } from '../src/households/invites.service';
import { MemberRole } from '../src/households/entities/member-role.enum';

/**
 * Unit tests for the privilege-escalation guard added in #65.
 * Full CRUD coverage lives with the future household-service integration
 * suite; these tests isolate the canGrant() call site.
 */

type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function makeRepo(): MockRepo {
  // Fluent builder shared by the duplicate-invite check (getOne) and
  // listForUser (getMany) — chainable, both terminal methods stubbed with
  // harmless defaults.
  const qb: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    take: jest.Mock;
    getOne: jest.Mock;
    getMany: jest.Mock;
  } = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((o: unknown) => o),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
}

describe('InvitesService — role-grant guard (#65)', () => {
  const HOUSEHOLD_ID = 'hh-1';
  const ACTOR_ID = 'actor-1';

  let inviteRepo: MockRepo;
  let members: { requireRole: jest.Mock };
  let redis: { set: jest.Mock; del: jest.Mock };
  let events: { emit: jest.Mock };
  let service: InvitesService;

  beforeEach(() => {
    inviteRepo = makeRepo();
    members = { requireRole: jest.fn() };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    events = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new InvitesService(
      inviteRepo as never,
      members as never,
      redis as never,
      events as never,
    );
  });

  it('rejects an ADMIN inviting another ADMIN (peer-level elevation)', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });

    await expect(
      service.create(HOUSEHOLD_ID, ACTOR_ID, {
        email: 'x@test',
        role: MemberRole.ADMIN,
      }),
    ).rejects.toThrow(
      new ForbiddenException('Cannot grant a role equal to or above your own'),
    );

    expect(inviteRepo.save).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rejects an ADMIN inviting an OWNER', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });

    await expect(
      service.create(HOUSEHOLD_ID, ACTOR_ID, {
        email: 'x@test',
        role: MemberRole.OWNER,
      }),
    ).rejects.toThrow(
      new ForbiddenException('Cannot grant a role equal to or above your own'),
    );

    expect(inviteRepo.save).not.toHaveBeenCalled();
  });

  it('lets an ADMIN invite a MEMBER', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });
    inviteRepo.save.mockResolvedValue({
      id: 'invite-1',
      token: 't',
      role: MemberRole.MEMBER,
    });

    await service.create(HOUSEHOLD_ID, ACTOR_ID, {
      email: 'x@test',
      role: MemberRole.MEMBER,
    });

    expect(inviteRepo.save).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'household.member.invited',
      expect.objectContaining({ role: MemberRole.MEMBER }),
      expect.any(Object),
    );
  });

  it('lets an OWNER invite an ADMIN', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.OWNER });
    inviteRepo.save.mockResolvedValue({
      id: 'invite-1',
      token: 't',
      role: MemberRole.ADMIN,
    });

    await service.create(HOUSEHOLD_ID, ACTOR_ID, {
      email: 'x@test',
      role: MemberRole.ADMIN,
    });

    expect(inviteRepo.save).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'household.member.invited',
      expect.objectContaining({ role: MemberRole.ADMIN }),
      expect.any(Object),
    );
  });

  it('defaults to MEMBER role when dto.role is omitted', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });
    inviteRepo.save.mockResolvedValue({
      id: 'invite-1',
      token: 't',
      role: MemberRole.MEMBER,
    });

    await service.create(HOUSEHOLD_ID, ACTOR_ID, { email: 'x@test' });

    expect(inviteRepo.save).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'household.member.invited',
      expect.objectContaining({ role: MemberRole.MEMBER }),
      expect.any(Object),
    );
  });

  it('rejects a second live invite for the same email/household (#68.7)', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });
    // Duplicate check returns an existing invite → create() must abort.
    const qb = inviteRepo.createQueryBuilder();
    (qb.getOne as jest.Mock).mockResolvedValueOnce({
      id: 'existing',
      email: 'x@test',
    });

    await expect(
      service.create(HOUSEHOLD_ID, ACTOR_ID, {
        email: 'x@test',
        role: MemberRole.MEMBER,
      }),
    ).rejects.toThrow(ConflictException);

    expect(inviteRepo.save).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('InvitesService — listForUser / decline (#267)', () => {
  const HOUSEHOLD_ID = 'hh-1';

  let inviteRepo: MockRepo;
  let service: InvitesService;

  beforeEach(() => {
    inviteRepo = makeRepo();
    const members = { requireRole: jest.fn() };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const events = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new InvitesService(
      inviteRepo as never,
      members as never,
      redis as never,
      events as never,
    );
  });

  it('listForUser matches the caller email case-insensitively and preloads the household', async () => {
    const qb = inviteRepo.createQueryBuilder();
    (qb.getMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'invite-1',
        email: 'x@test.com',
        household: { id: HOUSEHOLD_ID, name: 'Home' },
      },
    ]);

    const result = await service.listForUser('X@Test.com');

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'i.household',
      'household',
    );
    expect(qb.where).toHaveBeenCalledWith('LOWER(i.email) = :email', {
      email: 'x@test.com',
    });
    expect(result).toHaveLength(1);
    expect(result[0].household.name).toBe('Home');
  });

  it('decline deletes the invite and its Redis key when the email matches', async () => {
    const redis = { set: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    service = new InvitesService(
      inviteRepo as never,
      { requireRole: jest.fn() } as never,
      redis as never,
      { emit: jest.fn() } as never,
    );
    inviteRepo.findOne.mockResolvedValue({
      id: 'invite-1',
      token: 'tok',
      email: 'x@test.com',
    });

    await service.decline('tok', 'x@test.com');

    expect(inviteRepo.delete).toHaveBeenCalledWith('invite-1');
    expect(redis.del).toHaveBeenCalledWith('invite:tok');
  });

  it('decline rejects with 403 when the invite email does not match the caller', async () => {
    inviteRepo.findOne.mockResolvedValue({
      id: 'invite-1',
      token: 'tok',
      email: 'x@test.com',
    });

    await expect(
      service.decline('tok', 'someone-else@test.com'),
    ).rejects.toThrow(ForbiddenException);
    expect(inviteRepo.delete).not.toHaveBeenCalled();
  });

  it('decline rejects with 404 when the token does not exist', async () => {
    inviteRepo.findOne.mockResolvedValue(null);

    await expect(service.decline('missing', 'x@test.com')).rejects.toThrow(
      NotFoundException,
    );
  });
});
