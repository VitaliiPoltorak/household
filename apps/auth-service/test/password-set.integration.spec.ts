import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { AuthProvider } from '../src/users/entities/auth-provider.entity';
import { EmailThrottlerService } from '../src/auth/email-throttler.service';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
import { LoginAttemptTrackerService } from '../src/auth/login-attempt-tracker.service';
import { SessionsService } from '../src/sessions/sessions.service';

const unique = () => Math.random().toString(36).slice(2, 10);
const strongPassword = () => `Journey-Windmill-Copper-${unique()}`;

/**
 * Setting a first password on an OAuth-only account (#329).
 *
 * The gap this closes is not the dead change-password form — it is that an
 * account created through Google / Apple / Facebook was permanently locked to
 * that provider. `NO_PASSWORD_SET` named the state and nothing acted on it, so
 * losing the provider account meant losing this one.
 */
describe('POST /auth/password/set (integration)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let providerRepo: Repository<AuthProvider>;
  let throttler: EmailThrottlerService;
  let hasher: PasswordHasherService;
  let loginTracker: LoginAttemptTrackerService;
  let sessions: SessionsService;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    providerRepo = app.get<Repository<AuthProvider>>(getRepositoryToken(AuthProvider));
    throttler = app.get(EmailThrottlerService);
    hasher = app.get(PasswordHasherService);
    loginTracker = app.get(LoginAttemptTrackerService);
    sessions = app.get(SessionsService);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  /** An account as OAuth sign-in leaves it: verified, linked, no password. */
  const seedOAuthOnly = async (provider = 'google') => {
    const email = `pwset+${unique()}@example.com`;
    const user = await userRepo.save(
      userRepo.create({
        email,
        displayName: 'Provider User',
        avatarUrl: null,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      }),
    );
    await providerRepo.save(
      providerRepo.create({
        userId: user.id,
        provider,
        providerUserId: `ext-${unique()}`,
      }),
    );
    await throttler.resetForTest('password-set', email);
    await throttler.resetForTest('login', email);
    await loginTracker.resetForTest(email);
    return { user, email };
  };

  const seedWithPassword = async () => {
    const email = `pwset+${unique()}@example.com`;
    const password = strongPassword();
    const user = await userRepo.save(
      userRepo.create({
        email,
        displayName: 'Password User',
        avatarUrl: null,
        passwordHash: await hasher.hash(password),
        emailVerifiedAt: new Date(),
      }),
    );
    await throttler.resetForTest('password-set', email);
    return { user, email, password };
  };

  const setPassword = (userId: string, newPassword: string) =>
    request(app.getHttpServer())
      .post('/auth/password/set')
      .set('X-User-Id', userId)
      .send({ newPassword });

  describe('happy path', () => {
    it('sets the password and lets the account sign in with email + password', async () => {
      const { user, email } = await seedOAuthOnly();
      const newPassword = strongPassword();

      await setPassword(user.id, newPassword).expect(204);

      const stored = (await userRepo.findOne({ where: { id: user.id } }))!;
      expect(stored.passwordHash).toBeTruthy();
      // Stored as a hash, never the plaintext.
      expect(stored.passwordHash).not.toBe(newPassword);

      // The whole point: a second, provider-independent way in.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('leaves pre-existing sessions alive', async () => {
      const { user } = await seedOAuthOnly();
      // Two devices already signed in through the provider.
      const phone = await sessions.createSession(user.id, 'r-phone');
      const laptop = await sessions.createSession(user.id, 'r-laptop');

      await setPassword(user.id, strongPassword()).expect(204);

      // A password CHANGE may be a response to compromise, so it revokes
      // everything. Setting a FIRST password invalidates nothing — the account
      // gains a second way in and the existing one is untouched, so signing
      // the user out of their phone because they added a password on their
      // laptop would be friction with no security return.
      expect(await sessions.getSession(phone)).not.toBeNull();
      expect(await sessions.getSession(laptop)).not.toBeNull();
    });

    it('flips hasPassword on /auth/me', async () => {
      const { user } = await seedOAuthOnly();

      const before = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-User-Id', user.id)
        .expect(200);
      expect(before.body.hasPassword).toBe(false);

      await setPassword(user.id, strongPassword()).expect(204);

      const after = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-User-Id', user.id)
        .expect(200);
      expect(after.body.hasPassword).toBe(true);
    });
  });

  describe('refusals', () => {
    it('refuses an account that already has a password', async () => {
      const { user } = await seedWithPassword();

      const res = await setPassword(user.id, strongPassword()).expect(400);
      expect(res.body.code).toBe('PASSWORD_ALREADY_SET');
    });

    it('does not overwrite the existing hash when refused', async () => {
      const { user } = await seedWithPassword();
      const before = (await userRepo.findOne({ where: { id: user.id } }))!.passwordHash;

      await setPassword(user.id, strongPassword()).expect(400);

      const after = (await userRepo.findOne({ where: { id: user.id } }))!.passwordHash;
      expect(after).toBe(before);
    });

    it('holds a first password to the same strength bar as register', async () => {
      const { user } = await seedOAuthOnly();
      const res = await setPassword(user.id, 'password12345').expect(400);
      expect(res.body.code).toBe('WEAK_PASSWORD');

      const stored = (await userRepo.findOne({ where: { id: user.id } }))!;
      expect(stored.passwordHash).toBeNull();
    });

    it('rejects a password shorter than the DTO floor', async () => {
      const { user } = await seedOAuthOnly();
      await setPassword(user.id, 'Short-1').expect(400);
    });

    it('requires the X-User-Id header', async () => {
      await request(app.getHttpServer())
        .post('/auth/password/set')
        .send({ newPassword: strongPassword() })
        .expect(401);
    });

    it('401s for a user id that does not exist', async () => {
      await request(app.getHttpServer())
        .post('/auth/password/set')
        .set('X-User-Id', '00000000-0000-4000-8000-000000000000')
        .send({ newPassword: strongPassword() })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('reports the linked providers so the UI can explain the absent password', async () => {
      const { user } = await seedOAuthOnly('facebook');

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-User-Id', user.id)
        .expect(200);

      expect(res.body.hasPassword).toBe(false);
      expect(res.body.providers).toEqual(['facebook']);
    });

    it('never exposes the hash itself', async () => {
      const { user } = await seedWithPassword();

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-User-Id', user.id)
        .expect(200);

      expect(res.body.hasPassword).toBe(true);
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('$argon');
    });

    it('reports an empty provider list for a password-only account', async () => {
      const { user } = await seedWithPassword();

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-User-Id', user.id)
        .expect(200);

      expect(res.body.providers).toEqual([]);
    });
  });
});
