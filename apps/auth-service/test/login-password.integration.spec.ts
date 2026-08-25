import { INestApplication, Logger } from '@nestjs/common';
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
import { User } from '../src/users/entities/user.entity';
import { EmailVerificationService } from '../src/auth/email-verification.service';
import { EmailThrottlerService } from '../src/auth/email-throttler.service';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
import { LoginAttemptTrackerService } from '../src/auth/login-attempt-tracker.service';

const unique = () => Math.random().toString(36).slice(2, 10);
const strongPassword = () => `Journey-Windmill-Copper-${unique()}`;

describe('POST /auth/login with email + password (integration)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let verification: EmailVerificationService;
  let throttler: EmailThrottlerService;
  let hasher: PasswordHasherService;
  let loginTracker: LoginAttemptTrackerService;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    verification = app.get(EmailVerificationService);
    throttler = app.get(EmailThrottlerService);
    hasher = app.get(PasswordHasherService);
    loginTracker = app.get(LoginAttemptTrackerService);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const seedVerified = async (password?: string) => {
    const pw = password ?? strongPassword();
    const email = `verified+${unique()}@example.com`;
    const passwordHash = await hasher.hash(pw);
    const user = await userRepo.save(
      userRepo.create({
        email,
        displayName: 'Verified User',
        avatarUrl: null,
        passwordHash,
        emailVerifiedAt: new Date(),
      }),
    );
    await throttler.resetForTest('login', email);
    await loginTracker.resetForTest(email);
    return { user, email, password: pw };
  };

  const seedUnverified = async () => {
    const pw = strongPassword();
    const email = `unverified+${unique()}@example.com`;
    const passwordHash = await hasher.hash(pw);
    const user = await userRepo.save(
      userRepo.create({
        email,
        displayName: 'Pending User',
        avatarUrl: null,
        passwordHash,
        emailVerifiedAt: null,
      }),
    );
    await throttler.resetForTest('login', email);
    await loginTracker.resetForTest(email);
    await verification.forceExpireForTest(email);
    return { user, email, password: pw };
  };

  describe('happy path and credential handling', () => {
    it('signs the user in when credentials match and email is verified', async () => {
      const { email, password } = await seedVerified();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: expect.any(Number),
      });
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('household_refresh='))).toBe(
        true,
      );
      expect(cookies.some((c) => c.startsWith('household_csrf='))).toBe(true);
    });

    it('returns 401 with a generic message on wrong password', async () => {
      const { email } = await seedVerified();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'WrongPassword-2026-abc' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials' });
      // Response body must not leak whether the user exists — same phrasing
      // as the "user not found" branch below.
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 401 with the same generic message when the user does not exist', async () => {
      const email = `missing+${unique()}@example.com`;
      await throttler.resetForTest('login', email);
      await loginTracker.resetForTest(email);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: strongPassword() })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials' });
    });

    it('returns 401 for OAuth-only accounts (no passwordHash) with same generic message', async () => {
      const email = `oauth+${unique()}@example.com`;
      await throttler.resetForTest('login', email);
      await loginTracker.resetForTest(email);
      await userRepo.save(
        userRepo.create({
          email,
          displayName: 'OAuth Only',
          avatarUrl: null,
          passwordHash: null,
          emailVerifiedAt: new Date(),
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: strongPassword() })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials' });
    });

    it('returns 403 EMAIL_NOT_VERIFIED when password is correct but email is unverified', async () => {
      const { email, password } = await seedUnverified();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(403);

      expect(res.body).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        email,
      });
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('still returns 401 (not 403) if the password is wrong on an unverified account', async () => {
      // Verification state is a downstream signal — reveal it only when the
      // password check has already passed. Otherwise an attacker can enumerate
      // valid emails by getting 403 on any registered address.
      const { email } = await seedUnverified();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'WrongPassword-2026-xyz' })
        .expect(401);
    });

    it('email is compared case-insensitively', async () => {
      const { email, password } = await seedVerified();
      const upper = email.toUpperCase();

      // seedVerified already reset the lowercase bucket; use a fresh one for
      // the mixed-case call so it doesn't share the counter.
      await throttler.resetForTest('login', upper);
      await loginTracker.resetForTest(upper);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: upper, password })
        .expect(200);
    });
  });

  describe('soft-lock after 5 failed password attempts', () => {
    it('locks after the 5th failure, emits auth.account.locked with an unlock token stored in Redis', async () => {
      const { email, user } = await seedVerified();
      resetKafkaMocks();

      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: `Wrong-Attempt-${i}-xxx` })
          .expect(401);
      }
      expect(await loginTracker.isLocked(email)).toBe(false);

      // 5th wrong attempt trips the lock.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Wrong-Attempt-5-xxx' })
        .expect(401);
      expect(await loginTracker.isLocked(email)).toBe(true);

      // auth.account.locked was emitted with the user identity — the payload
      // deliberately does NOT include the unlock token (that lives only in
      // Redis and would be leaked by any Kafka consumer that logged the
      // envelope). notification-service will look up the token by userId
      // when it lands.
      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'auth.account.locked',
        expect.objectContaining({ userId: user.id, email }),
      );
    });

    it('refuses the correct password while locked with 403 ACCOUNT_LOCKED', async () => {
      const { email, password } = await seedVerified();
      // Bypass the 5-attempts warm-up by tripping the lock directly.
      await loginTracker.recordFailure(email, 'seed-user-id');
      for (let i = 0; i < 4; i++) {
        await loginTracker.recordFailure(email, 'seed-user-id');
      }
      expect(await loginTracker.isLocked(email)).toBe(true);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    });

    it('correct password before lock resets the failure counter (no premature lock)', async () => {
      const { email, password } = await seedVerified();
      // 4 wrong attempts — one below the threshold.
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: `Wrong-${i}-xxx` })
          .expect(401);
      }
      // Correct password succeeds and clears the counter.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      expect(await loginTracker.isLocked(email)).toBe(false);

      // Four more wrong attempts should NOT lock (counter was reset to 0).
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: `Wrong-again-${i}-xxx` })
          .expect(401);
      }
      expect(await loginTracker.isLocked(email)).toBe(false);
    });

    // #212 — unlock token must never reach prod logs.
    describe('AUTH_DEV_LOG_SECRETS gating', () => {
      let logSpy: jest.SpyInstance;
      const originalFlag = process.env.AUTH_DEV_LOG_SECRETS;

      beforeEach(() => {
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      });

      afterEach(() => {
        logSpy.mockRestore();
        if (originalFlag === undefined) {
          delete process.env.AUTH_DEV_LOG_SECRETS;
        } else {
          process.env.AUTH_DEV_LOG_SECRETS = originalFlag;
        }
      });

      it('emits no unlock token in captured logs when the flag is unset', async () => {
        delete process.env.AUTH_DEV_LOG_SECRETS;
        const { email } = await seedVerified();

        for (let i = 0; i < 5; i++) {
          await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password: `Wrong-Attempt-${i}-xxx` })
            .expect(401);
        }
        const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).not.toContain(email);
        expect(logged).not.toContain('unlock token');
      });

      it('logs the masked email + unlock token when the flag is explicitly true', async () => {
        process.env.AUTH_DEV_LOG_SECRETS = 'true';
        const { email } = await seedVerified();

        for (let i = 0; i < 5; i++) {
          await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password: `Wrong-Attempt-${i}-xxx` })
            .expect(401);
        }

        const match = logSpy.mock.calls
          .map((c) => String(c[0]))
          .find((m) => m.includes('unlock token'));
        expect(match).toBeTruthy();
        expect(match).not.toContain(email); // masked local part, domain kept
        expect(match).toContain('@example.com');
      });
    });
  });

  describe('POST /auth/unlock', () => {
    it('consumes a single-use token, clears the lock, allows the correct password to log in', async () => {
      const { email, password, user } = await seedVerified();
      // Directly trip the lock and grab the token.
      let token: string | undefined;
      for (let i = 0; i < 5; i++) {
        const result = await loginTracker.recordFailure(email, user.id);
        if (result.status === 'lockedNow') token = result.unlockToken;
      }
      expect(token).toBeDefined();
      expect(await loginTracker.isLocked(email)).toBe(true);

      await request(app.getHttpServer())
        .post('/auth/unlock')
        .send({ token })
        .expect(204);
      expect(await loginTracker.isLocked(email)).toBe(false);

      // Token is single-use — replay fails.
      await request(app.getHttpServer())
        .post('/auth/unlock')
        .send({ token })
        .expect(400);

      // Correct password works after unlock.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
    });

    it('rejects a bogus token with 400 INVALID_UNLOCK_TOKEN', async () => {
      const bogus = '0'.repeat(64);
      const res = await request(app.getHttpServer())
        .post('/auth/unlock')
        .send({ token: bogus })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_UNLOCK_TOKEN' });
    });

    it('rejects a malformed token at DTO validation (400 — not hex, wrong length)', async () => {
      await request(app.getHttpServer())
        .post('/auth/unlock')
        .send({ token: 'not-a-hex-token' })
        .expect(400);
    });
  });

  describe('rehash-on-login (Argon2 policy migration)', () => {
    it('rewrites the stored hash if PasswordHasherService.needsRehash returns true', async () => {
      // Seed the user under the current (test-env floor) parameters — the
      // resulting hash is m=8. Then bump the running hasher to require m=16
      // so the stored hash trips needsRehash on next login. Restoring the
      // params in finally keeps the mutation local to this test.
      const { email, password, user } = await seedVerified();
      const originalHash = user.passwordHash!;
      const params = (
        hasher as unknown as { currentParams: { memoryCost: number } }
      ).currentParams;
      const originalMemory = params.memoryCost;
      params.memoryCost = originalMemory * 2;

      try {
        expect(hasher.needsRehash(originalHash)).toBe(true);

        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password })
          .expect(200);

        const after = await userRepo.findOne({ where: { id: user.id } });
        expect(after!.passwordHash).not.toBe(originalHash);
        // Rewritten under the new (higher) policy, so needsRehash is now false.
        expect(hasher.needsRehash(after!.passwordHash!)).toBe(false);
      } finally {
        params.memoryCost = originalMemory;
      }
    });
  });
});
