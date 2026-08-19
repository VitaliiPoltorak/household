import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { EmailThrottlerService } from '../src/auth/email-throttler.service';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
import { SessionsService } from '../src/sessions/sessions.service';
import { LoginAttemptTrackerService } from '../src/auth/login-attempt-tracker.service';

const unique = () => Math.random().toString(36).slice(2, 10);
const strongPassword = () => `Journey-Windmill-Copper-${unique()}`;

describe('POST /auth/password/change (integration)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let throttler: EmailThrottlerService;
  let hasher: PasswordHasherService;
  let sessions: SessionsService;
  let loginTracker: LoginAttemptTrackerService;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    throttler = app.get(EmailThrottlerService);
    hasher = app.get(PasswordHasherService);
    sessions = app.get(SessionsService);
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
    const email = `pwchange+${unique()}@example.com`;
    const passwordHash = await hasher.hash(pw);
    const user = await userRepo.save(
      userRepo.create({
        email,
        displayName: 'Change Me',
        avatarUrl: null,
        passwordHash,
        emailVerifiedAt: new Date(),
      }),
    );
    await throttler.resetForTest('login', email);
    await throttler.resetForTest('password-change', email);
    await loginTracker.resetForTest(email);
    return { user, email, password: pw };
  };

  describe('happy path', () => {
    it('rotates the hash, returns fresh cookies + access token, revokes old sessions, allows new-password login', async () => {
      const { email, password, user } = await seedVerified();
      const newPassword = strongPassword();

      // Create a "live" session by logging in first — we'll assert it's
      // gone after the change.
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      const initialCookies = loginRes.headers['set-cookie'] as unknown as string[];
      const initialRefresh = extractCookie(initialCookies, 'household_refresh');
      expect(initialRefresh).toBeTruthy();

      const beforeHash = (await userRepo.findOne({ where: { id: user.id } }))!.passwordHash!;

      const res = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({ currentPassword: password, newPassword })
        .expect(200);

      // Response carries a brand-new access token + cookies — the caller
      // stays signed in on this device.
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: expect.any(Number),
      });
      const rotatedCookies = res.headers['set-cookie'] as unknown as string[];
      const rotatedRefresh = extractCookie(rotatedCookies, 'household_refresh');
      expect(rotatedRefresh).toBeTruthy();
      expect(rotatedRefresh).not.toBe(initialRefresh);

      const afterHash = (await userRepo.findOne({ where: { id: user.id } }))!.passwordHash!;
      expect(afterHash).not.toBe(beforeHash);

      // Old password no longer works.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(401);

      // New password works.
      await throttler.resetForTest('login', email);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('revokes every prior session belonging to the user', async () => {
      const { password, user } = await seedVerified();

      // Simulate two "other" active devices.
      const otherA = await sessions.createSession(user.id, 'r-a');
      const otherB = await sessions.createSession(user.id, 'r-b');
      expect(await sessions.getSession(otherA)).not.toBeNull();
      expect(await sessions.getSession(otherB)).not.toBeNull();

      await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({ currentPassword: password, newPassword: strongPassword() })
        .expect(200);

      // Other-device sessions are gone.
      expect(await sessions.getSession(otherA)).toBeNull();
      expect(await sessions.getSession(otherB)).toBeNull();
    });
  });

  describe('validation & guards', () => {
    it('rejects wrong current password with generic 401 (same shape as login)', async () => {
      const { user } = await seedVerified();

      const res = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({
          currentPassword: 'wrong-current-password-here',
          newPassword: strongPassword(),
        })
        .expect(401);
      expect(res.body).toMatchObject({ message: 'Invalid credentials' });
    });

    it('rejects OAuth-only accounts with 400 NO_PASSWORD_SET', async () => {
      const email = `oauth+${unique()}@example.com`;
      const user = await userRepo.save(
        userRepo.create({
          email,
          displayName: 'OAuth Only',
          avatarUrl: null,
          passwordHash: null,
          emailVerifiedAt: new Date(),
        }),
      );
      await throttler.resetForTest('password-change', email);

      const res = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({ currentPassword: 'anything-goes', newPassword: strongPassword() })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'NO_PASSWORD_SET' });
    });

    it('rejects a weak new password with 400 WEAK_PASSWORD (zxcvbn)', async () => {
      const { password, user } = await seedVerified();

      const res = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({ currentPassword: password, newPassword: 'passwordpassword' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'WEAK_PASSWORD' });
      expect(res.body.score).toBeLessThan(3);
    });

    it('rejects reuse of the same password with 400 SAME_PASSWORD', async () => {
      const { password, user } = await seedVerified();

      const res = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({ currentPassword: password, newPassword: password })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'SAME_PASSWORD' });
    });

    it('rejects a new password shorter than 12 chars at the DTO layer', async () => {
      const { password, user } = await seedVerified();
      await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', user.id)
        .send({ currentPassword: password, newPassword: 'short' })
        .expect(400);
    });

    it('rejects when X-User-Id is missing (401)', async () => {
      await request(app.getHttpServer())
        .post('/auth/password/change')
        .send({ currentPassword: 'x', newPassword: strongPassword() })
        .expect(401);
    });

    it('rejects when the authenticated user has been deleted (401)', async () => {
      const ghostUserId = '99999999-9999-4999-8999-999999999999';
      await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('X-User-Id', ghostUserId)
        .send({ currentPassword: 'x', newPassword: strongPassword() })
        .expect(401);
    });
  });
});

function extractCookie(setCookieHeaders: string[], name: string): string | undefined {
  const found = setCookieHeaders.find((c) => c.startsWith(`${name}=`));
  if (!found) return undefined;
  return found.slice(name.length + 1).split(';')[0];
}
