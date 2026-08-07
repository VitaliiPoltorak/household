import { ForbiddenException } from '@nestjs/common';
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
};

function makeRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((o: unknown) => o),
    update: jest.fn(),
    delete: jest.fn(),
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
    redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
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
      service.create(HOUSEHOLD_ID, ACTOR_ID, { email: 'x@test', role: MemberRole.ADMIN }),
    ).rejects.toThrow(new ForbiddenException('Cannot grant a role equal to or above your own'));

    expect(inviteRepo.save).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rejects an ADMIN inviting an OWNER', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });

    await expect(
      service.create(HOUSEHOLD_ID, ACTOR_ID, { email: 'x@test', role: MemberRole.OWNER }),
    ).rejects.toThrow(new ForbiddenException('Cannot grant a role equal to or above your own'));

    expect(inviteRepo.save).not.toHaveBeenCalled();
  });

  it('lets an ADMIN invite a MEMBER', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });
    inviteRepo.save.mockResolvedValue({ id: 'invite-1', token: 't', role: MemberRole.MEMBER });

    await service.create(HOUSEHOLD_ID, ACTOR_ID, { email: 'x@test', role: MemberRole.MEMBER });

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
    inviteRepo.save.mockResolvedValue({ id: 'invite-1', token: 't', role: MemberRole.ADMIN });

    await service.create(HOUSEHOLD_ID, ACTOR_ID, { email: 'x@test', role: MemberRole.ADMIN });

    expect(inviteRepo.save).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'household.member.invited',
      expect.objectContaining({ role: MemberRole.ADMIN }),
      expect.any(Object),
    );
  });

  it('defaults to MEMBER role when dto.role is omitted', async () => {
    members.requireRole.mockResolvedValue({ id: 'a', role: MemberRole.ADMIN });
    inviteRepo.save.mockResolvedValue({ id: 'invite-1', token: 't', role: MemberRole.MEMBER });

    await service.create(HOUSEHOLD_ID, ACTOR_ID, { email: 'x@test' });

    expect(inviteRepo.save).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'household.member.invited',
      expect.objectContaining({ role: MemberRole.MEMBER }),
      expect.any(Object),
    );
  });
});
