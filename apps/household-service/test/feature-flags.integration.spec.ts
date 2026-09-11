import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
  mockKafkaProducer,
} from '@household/testing';
import { AppModule } from '../src/app.module';
import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';
import { HouseholdMember } from '../src/households/entities/household-member.entity';
import { MemberRole } from '../src/households/entities/member-role.enum';
import { FeatureFlagOverride } from '../src/feature-flags/entities/feature-flag-override.entity';
import { FeatureFlag } from '../src/feature-flags/entities/feature-flag.entity';
import {
  FeatureFlagActorType,
  FeatureFlagOverrideSource,
} from '../src/feature-flags/entities/feature-flag-status.enum';

const FLAG = 'monobank-integration'; // registered in libs/contracts with enabledDefault: true

describe('Feature flags (integration)', () => {
  let app: INestApplication;
  let memberRepo: Repository<HouseholdMember>;
  let flagRepo: Repository<FeatureFlag>;
  let overrideRepo: Repository<FeatureFlagOverride>;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    memberRepo = app.get<Repository<HouseholdMember>>(
      getRepositoryToken(HouseholdMember),
    );
    flagRepo = app.get<Repository<FeatureFlag>>(
      getRepositoryToken(FeatureFlag),
    );
    overrideRepo = app.get<Repository<FeatureFlagOverride>>(
      getRepositoryToken(FeatureFlagOverride),
    );
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    // cleanDatabase TRUNCATEs every table, including the registry-seeded
    // feature_flags row created by FeatureFlagsService.onModuleInit() at
    // boot — re-seed it so each test starts from the same known state.
    await app.get(FeatureFlagsService).onModuleInit();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createHousehold(ownerUserId: string, name = 'Home') {
    const res = await request(app.getHttpServer())
      .post('/households')
      .set('X-User-Id', ownerUserId)
      .send({ name })
      .expect(201);
    return res.body.id as string;
  }

  async function addMember(
    householdId: string,
    userId: string,
    role: MemberRole,
  ) {
    await memberRepo.save(memberRepo.create({ householdId, userId, role }));
  }

  describe('GET /feature-flags', () => {
    it('resolves the registry default when no override exists', async () => {
      const res = await request(app.getHttpServer())
        .get('/feature-flags')
        .set('X-User-Id', 'u1')
        .expect(200);

      expect(res.body).toEqual({ [FLAG]: true });
    });

    it('rejects without X-User-Id', async () => {
      await request(app.getHttpServer()).get('/feature-flags').expect(401);
    });
  });

  describe('GET /feature-flags/:flagKey/state', () => {
    it('returns raw states with no auth required when no actor headers are sent', async () => {
      const res = await request(app.getHttpServer())
        .get(`/feature-flags/${FLAG}/state`)
        .expect(200);

      expect(res.body).toEqual({
        default: true,
        household: 'none',
        user: 'none',
      });
    });

    it('allows a real household member to resolve their own household', async () => {
      const householdId = await createHousehold('owner-1');

      await request(app.getHttpServer())
        .get(`/feature-flags/${FLAG}/state`)
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .expect(200);
    });

    it('rejects (IDOR guard) when the caller is not a member of the claimed household', async () => {
      const householdId = await createHousehold('owner-1');

      await request(app.getHttpServer())
        .get(`/feature-flags/${FLAG}/state`)
        .set('X-User-Id', 'intruder')
        .set('X-Household-Id', householdId)
        .expect(403);
    });

    it('404s for an unknown flag key', async () => {
      await request(app.getHttpServer())
        .get('/feature-flags/does-not-exist/state')
        .expect(404);
    });
  });

  describe('household override — resolution order', () => {
    it('a household override beats the global default', async () => {
      const householdId = await createHousehold('owner-1');

      await request(app.getHttpServer())
        .put(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .send({ enabled: false })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/feature-flags')
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .expect(200);
      expect(res.body[FLAG]).toBe(false);

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'feature-flag.updated',
        { flagKey: FLAG, actorType: 'household', actorId: householdId },
        { householdId },
      );
    });

    it('a user override beats a household override', async () => {
      const householdId = await createHousehold('owner-1');
      await addMember(householdId, 'member-1', MemberRole.MEMBER);

      const flag = await flagRepo.findOneOrFail({ where: { flagKey: FLAG } });
      await overrideRepo.save(
        overrideRepo.create({
          flagId: flag.id,
          actorType: FeatureFlagActorType.HOUSEHOLD,
          actorId: householdId,
          enabled: false,
          source: FeatureFlagOverrideSource.MANUAL,
        }),
      );
      await overrideRepo.save(
        overrideRepo.create({
          flagId: flag.id,
          actorType: FeatureFlagActorType.USER,
          actorId: 'member-1',
          enabled: true,
          source: FeatureFlagOverrideSource.MANUAL,
        }),
      );

      const res = await request(app.getHttpServer())
        .get('/feature-flags')
        .set('X-User-Id', 'member-1')
        .set('X-Household-Id', householdId)
        .expect(200);
      expect(res.body[FLAG]).toBe(true);
    });

    it('reverts to the default after the override is cleared', async () => {
      const householdId = await createHousehold('owner-1');
      await request(app.getHttpServer())
        .put(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .send({ enabled: false })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/feature-flags')
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .expect(200);
      expect(res.body[FLAG]).toBe(true);
    });

    it('does not leak an override into another household (tenant isolation)', async () => {
      const householdA = await createHousehold('owner-a');
      const householdB = await createHousehold('owner-b');

      await request(app.getHttpServer())
        .put(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'owner-a')
        .set('X-Household-Id', householdA)
        .send({ enabled: false })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/feature-flags')
        .set('X-User-Id', 'owner-b')
        .set('X-Household-Id', householdB)
        .expect(200);
      expect(res.body[FLAG]).toBe(true);
    });
  });

  describe('household override — authorization', () => {
    it('rejects a plain MEMBER (owner/admin only)', async () => {
      const householdId = await createHousehold('owner-1');
      await addMember(householdId, 'member-1', MemberRole.MEMBER);

      await request(app.getHttpServer())
        .put(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'member-1')
        .set('X-Household-Id', householdId)
        .send({ enabled: false })
        .expect(403);
    });

    it('allows an ADMIN', async () => {
      const householdId = await createHousehold('owner-1');
      await addMember(householdId, 'admin-1', MemberRole.ADMIN);

      await request(app.getHttpServer())
        .put(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'admin-1')
        .set('X-Household-Id', householdId)
        .send({ enabled: false })
        .expect(200);
    });

    it('rejects without X-Household-Id', async () => {
      await request(app.getHttpServer())
        .put(`/feature-flags/${FLAG}/household-override`)
        .set('X-User-Id', 'owner-1')
        .send({ enabled: false })
        .expect(401);
    });

    it('404s for an unknown flag key', async () => {
      const householdId = await createHousehold('owner-1');
      await request(app.getHttpServer())
        .put('/feature-flags/does-not-exist/household-override')
        .set('X-User-Id', 'owner-1')
        .set('X-Household-Id', householdId)
        .send({ enabled: false })
        .expect(404);
    });
  });
});
