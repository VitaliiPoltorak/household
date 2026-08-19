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
import { User } from '../src/users/entities/user.entity';
import { EmailVerificationService } from '../src/auth/email-verification.service';
import { EmailThrottlerService } from '../src/auth/email-throttler.service';

// Random suffix per email keeps each test on its own throttler bucket even
// when the suite runs against a shared Redis. cleanDatabase() clears Postgres
// between tests, but Redis persists across the whole run.
const unique = () => Math.random().toString(36).slice(2, 10);

// Passphrase that clears MinLength(12) + zxcvbn ≥ 3 + is (statistically) not
// in the HIBP corpus. Random suffix guarantees no accidental collision if a
// future check ever runs live.
const strongPassword = () => `Journey-Windmill-Copper-${unique()}`;

describe('register → verify → resend flow (integration)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let verification: EmailVerificationService;
  let throttler: EmailThrottlerService;

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    verification = app.get(EmailVerificationService);
    throttler = app.get(EmailThrottlerService);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates an unverified user, hashes the password with Argon2id, issues a code, emits verification_requested', async () => {
      const email = `alice+${unique()}@example.com`;
      await throttler.resetForTest('register', email);
      const password = strongPassword();

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, displayName: 'Alice' })
        .expect(202);

      // Response is intentionally minimal — no access token, no code.
      expect(res.body).toEqual({ userId: expect.any(String), email });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('code');

      const user = await userRepo.findOne({ where: { email } });
      expect(user).toBeTruthy();
      expect(user!.passwordHash).toBeTruthy();
      expect(user!.passwordHash).not.toBe(password);
      // Argon2id hash marker (not bcrypt's $2b$…).
      expect(user!.passwordHash!.startsWith('$argon2id$')).toBe(true);
      expect(user!.emailVerifiedAt).toBeNull();

      // Code lives in Redis, not the payload or the DB.
      const stored = await verification.peekForTest(email);
      expect(stored).toEqual({ code: expect.stringMatching(/^\d{6}$/), attempts: 0 });

      // verification_requested payload does NOT include the plaintext code —
      // notification-service will read it directly from Redis when #30 lands.
      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'auth.email.verification_requested',
        {
          userId: user!.id,
          email,
          displayName: 'Alice',
        },
      );
      // No auth.user.created yet — that fires only after verification.
      expect(mockKafkaProducer.emit).not.toHaveBeenCalledWith(
        'auth.user.created',
        expect.anything(),
      );
    });

    it('rejects a duplicate email with 409', async () => {
      const email = `dup+${unique()}@example.com`;
      await throttler.resetForTest('register', email);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: strongPassword(), displayName: 'First' })
        .expect(202);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: strongPassword(), displayName: 'Second' })
        .expect(409);
    });

    it('rejects a password shorter than 12 chars at the DTO layer (400)', async () => {
      const email = `short+${unique()}@example.com`;
      await throttler.resetForTest('register', email);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'short', displayName: 'Alice' })
        .expect(400);
    });

    it('rejects a weak-but-long password via zxcvbn (400 WEAK_PASSWORD)', async () => {
      const email = `weak+${unique()}@example.com`;
      await throttler.resetForTest('register', email);
      // 12+ chars but a common-word chain — zxcvbn will score 0-1.
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'passwordpassword', displayName: 'W' })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'WEAK_PASSWORD',
        score: expect.any(Number),
      });
      expect(res.body.score).toBeLessThan(3);
    });

    // Note: derivable-password detection (email/displayName primed into
    // zxcvbn via userInputs) is covered by the PasswordComplexityService
    // unit spec — an integration duplicate here would be brittle against
    // future dictionary changes in @zxcvbn-ts/language-en.

    it('rejects a malformed email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: strongPassword(),
          displayName: 'A',
        })
        .expect(400);
    });

    it('normalises the email to lowercase before persist', async () => {
      const local = `Mixed+${unique()}`;
      await throttler.resetForTest('register', `${local.toLowerCase()}@example.com`);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `${local}@EXAMPLE.com`,
          password: strongPassword(),
          displayName: 'M',
        })
        .expect(202);

      // Only the lowercase form should be findable.
      const lower = await userRepo.findOne({ where: { email: `${local.toLowerCase()}@example.com` } });
      expect(lower).toBeTruthy();
    });
  });

  describe('POST /auth/verify-email', () => {
    const setup = async () => {
      const email = `verify+${unique()}@example.com`;
      const password = strongPassword();
      await throttler.resetForTest('register', email);
      await throttler.resetForTest('verify-email', email);
      await throttler.resetForTest('resend-verification', email);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, displayName: 'Bob' })
        .expect(202);
      const stored = await verification.peekForTest(email);
      return { email, code: stored!.code, password };
    };

    it('happy path: 200, sets cookies, emits auth.user.created, consumes the code', async () => {
      const { email, code } = await setup();
      resetKafkaMocks(); // drop the verification_requested from register

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: expect.any(Number),
      });

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('household_refresh='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('household_csrf='))).toBe(true);

      // Code atomically consumed on match.
      const stored = await verification.peekForTest(email);
      expect(stored).toBeNull();

      const user = await userRepo.findOne({ where: { email } });
      expect(user!.emailVerifiedAt).toBeInstanceOf(Date);

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'auth.user.created',
        expect.objectContaining({ userId: user!.id, email, provider: 'password' }),
      );
    });

    it('wrong code: 400 CODE_INVALID with attemptsRemaining, code still present', async () => {
      const { email } = await setup();

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(400);

      expect(res.body).toMatchObject({
        code: 'CODE_INVALID',
        attemptsRemaining: expect.any(Number),
      });
      const stored = await verification.peekForTest(email);
      expect(stored).toBeTruthy();
      expect(stored!.attempts).toBe(1);
    });

    it('5 wrong attempts exhaust the code (400 CODE_ATTEMPTS_EXHAUSTED)', async () => {
      const { email } = await setup();

      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/verify-email')
          .send({ email, code: '000000' })
          .expect(400);
      }
      // 5th wrong attempt invalidates the code entirely.
      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(400);

      expect(res.body).toMatchObject({ code: 'CODE_ATTEMPTS_EXHAUSTED' });
      const stored = await verification.peekForTest(email);
      expect(stored).toBeNull();

      // Further attempts return CODE_EXPIRED_OR_MISSING since the code is gone.
      const followup = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(400);
      expect(followup.body).toMatchObject({ code: 'CODE_EXPIRED_OR_MISSING' });
    });

    it('expired / missing code: 400 CODE_EXPIRED_OR_MISSING', async () => {
      const { email } = await setup();
      // Simulate TTL expiry without waiting 15 minutes.
      await verification.forceExpireForTest(email);

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code: '123456' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'CODE_EXPIRED_OR_MISSING' });
    });
  });

  describe('POST /auth/verify-email/resend', () => {
    it('rotates the code and resets attempts', async () => {
      const email = `resend+${unique()}@example.com`;
      await throttler.resetForTest('register', email);
      await throttler.resetForTest('verify-email', email);
      await throttler.resetForTest('resend-verification', email);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: strongPassword(), displayName: 'R' })
        .expect(202);

      const first = await verification.peekForTest(email);

      // Two wrong attempts, then resend.
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(400);

      const beforeResend = await verification.peekForTest(email);
      expect(beforeResend!.attempts).toBe(2);

      resetKafkaMocks();
      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .send({ email })
        .expect(202);
      expect(res.body).toEqual({ ok: true });

      const rotated = await verification.peekForTest(email);
      expect(rotated!.attempts).toBe(0);
      expect(rotated!.code).not.toBe(first!.code);

      expect(mockKafkaProducer.emit).toHaveBeenCalledWith(
        'auth.email.verification_requested',
        expect.objectContaining({ email }),
      );
    });

    it('returns 202 for unknown email (no enumeration signal, no Kafka event)', async () => {
      const email = `ghost+${unique()}@example.com`;
      await throttler.resetForTest('resend-verification', email);
      resetKafkaMocks();

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .send({ email })
        .expect(202);
      expect(res.body).toEqual({ ok: true });
      expect(mockKafkaProducer.emit).not.toHaveBeenCalled();
    });

    it('returns 202 for already-verified email without re-issuing a code', async () => {
      const email = `already+${unique()}@example.com`;
      await throttler.resetForTest('register', email);
      await throttler.resetForTest('verify-email', email);
      await throttler.resetForTest('resend-verification', email);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: strongPassword(), displayName: 'A' })
        .expect(202);
      const { code } = (await verification.peekForTest(email))!;
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ email, code })
        .expect(200);

      resetKafkaMocks();
      await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .send({ email })
        .expect(202);

      expect(await verification.peekForTest(email)).toBeNull();
      expect(mockKafkaProducer.emit).not.toHaveBeenCalled();
    });
  });

  describe('per-email throttling', () => {
    it('returns 429 after 3 resend requests in a row', async () => {
      const email = `throttle+${unique()}@example.com`;
      await throttler.resetForTest('resend-verification', email);

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/auth/verify-email/resend')
          .send({ email })
          .expect(202);
      }
      await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .send({ email })
        .expect(429);
    });
  });
});
