import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  cleanDatabase,
  resetKafkaMocks,
} from '@household/testing';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { OnboardingStatus } from '../src/users/entities/onboarding-status.enum';

describe('Onboarding status via /auth/me (integration, #347)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const seedUser = async (overrides: Partial<User> = {}) =>
    userRepo.save(
      userRepo.create({
        email: `${Math.random().toString(36).slice(2)}@example.com`,
        displayName: 'Alice Example',
        avatarUrl: null,
        locale: 'en',
        ...overrides,
      }),
    );

  it('defaults a newly created user to pending', async () => {
    const user = await seedUser();

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('X-User-Id', user.id)
      .expect(200);

    expect(res.body.onboardingStatus).toBe(OnboardingStatus.PENDING);
  });

  it.each([
    OnboardingStatus.COMPLETED,
    OnboardingStatus.SKIPPED,
    OnboardingStatus.REVIEWED_LATER,
  ])('persists onboardingStatus=%s via PATCH /auth/me', async (status) => {
    const user = await seedUser();

    const patchRes = await request(app.getHttpServer())
      .patch('/auth/me')
      .set('X-User-Id', user.id)
      .send({ onboardingStatus: status })
      .expect(200);
    expect(patchRes.body.onboardingStatus).toBe(status);

    const getRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('X-User-Id', user.id)
      .expect(200);
    expect(getRes.body.onboardingStatus).toBe(status);
  });

  it('rejects an unknown onboardingStatus value (400)', async () => {
    const user = await seedUser();

    await request(app.getHttpServer())
      .patch('/auth/me')
      .set('X-User-Id', user.id)
      .send({ onboardingStatus: 'not-a-real-status' })
      .expect(400);
  });

  it('updating onboardingStatus leaves displayName and locale untouched', async () => {
    const user = await seedUser({ displayName: 'Carol', locale: 'de' });

    const res = await request(app.getHttpServer())
      .patch('/auth/me')
      .set('X-User-Id', user.id)
      .send({ onboardingStatus: OnboardingStatus.SKIPPED })
      .expect(200);

    expect(res.body.displayName).toBe('Carol');
    expect(res.body.locale).toBe('de');
  });
});
