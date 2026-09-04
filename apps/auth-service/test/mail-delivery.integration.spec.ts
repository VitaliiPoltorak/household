import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { EmailVerificationService } from '../src/auth/email-verification.service';
import { EmailThrottlerService } from '../src/auth/email-throttler.service';
import { PasswordHasherService } from '../src/auth/password-hasher.service';
import { LoginAttemptTrackerService } from '../src/auth/login-attempt-tracker.service';
import {
  MAIL_TRANSPORT,
  MailMessage,
  MailTransport,
} from '../src/mail/mail-transport.interface';

const unique = () => Math.random().toString(36).slice(2, 10);
const strongPassword = () => `Journey-Windmill-Copper-${unique()}`;

/** Collects everything the service tries to send instead of talking to SMTP. */
class CollectingTransport implements MailTransport {
  readonly name = 'collecting';
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
  reset() {
    this.sent.length = 0;
  }
  to(email: string): MailMessage[] {
    return this.sent.filter((m) => m.to === email);
  }
}

/**
 * #319 — the regression guard for "the code is generated but never leaves the
 * process". Asserts at the transport seam: whatever ends up in Redis must also
 * end up in a message addressed to the user.
 */
describe('transactional email delivery (integration)', () => {
  let app: INestApplication;
  let mail: CollectingTransport;
  let userRepo: Repository<User>;
  let verification: EmailVerificationService;
  let throttler: EmailThrottlerService;
  let hasher: PasswordHasherService;
  let loginTracker: LoginAttemptTrackerService;

  beforeAll(async () => {
    mail = new CollectingTransport();
    app = await createTestApp(AppModule, (builder) =>
      builder.overrideProvider(MAIL_TRANSPORT).useValue(mail),
    );
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    verification = app.get(EmailVerificationService);
    throttler = app.get(EmailThrottlerService);
    hasher = app.get(PasswordHasherService);
    loginTracker = app.get(LoginAttemptTrackerService);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
    mail.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('emails the registrant the same code that register stored in Redis', async () => {
    const email = `mailreg+${unique()}@example.com`;
    await throttler.resetForTest('register', email);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: strongPassword(), displayName: 'Alice' })
      .expect(202);

    const stored = await verification.peekForTest(email);
    expect(stored).toBeTruthy();

    const messages = mail.to(email);
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe('verification-code');
    expect(messages[0].text).toContain(stored!.code);
    expect(messages[0].subject).toContain(stored!.code);
  });

  it('emails the code the user actually needs — verifying with it completes signup', async () => {
    const email = `mailflow+${unique()}@example.com`;
    await throttler.resetForTest('register', email);
    await throttler.resetForTest('verify-email', email);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: strongPassword(), displayName: 'Alice' })
      .expect(202);

    // Pull the code out of the delivered message, exactly as a user reading
    // their mailbox would — not out of Redis.
    const code = mail.to(email)[0].text.match(/\b\d{6}\b/)?.[0];
    expect(code).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(200);

    const user = await userRepo.findOne({ where: { email } });
    expect(user!.emailVerifiedAt).not.toBeNull();
  });

  it('emails a fresh code on resend', async () => {
    const email = `mailresend+${unique()}@example.com`;
    await throttler.resetForTest('register', email);
    await throttler.resetForTest('resend-verification', email);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: strongPassword(), displayName: 'Alice' })
      .expect(202);
    const firstCode = (await verification.peekForTest(email))!.code;

    await request(app.getHttpServer())
      .post('/auth/verify-email/resend')
      .send({ email })
      .expect(202);

    const secondCode = (await verification.peekForTest(email))!.code;
    const messages = mail.to(email);
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toContain(firstCode);
    expect(messages[1].text).toContain(secondCode);
  });

  it('sends no mail when resend is called for an address with no account', async () => {
    const email = `ghost+${unique()}@example.com`;
    await throttler.resetForTest('resend-verification', email);

    // Uniform 200 (no enumeration) — but nothing should be delivered.
    await request(app.getHttpServer())
      .post('/auth/verify-email/resend')
      .send({ email })
      .expect(202);

    expect(mail.sent).toHaveLength(0);
  });

  it('emails an unlock link carrying the live token when the account soft-locks', async () => {
    const password = strongPassword();
    const email = `maillock+${unique()}@example.com`;
    await userRepo.save(
      userRepo.create({
        email,
        displayName: 'Locked User',
        avatarUrl: null,
        passwordHash: await hasher.hash(password),
        emailVerifiedAt: new Date(),
      }),
    );
    await throttler.resetForTest('login', email);
    await loginTracker.resetForTest(email);

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Wrong-Password-Entirely-1' })
        .expect(401);
    }

    const messages = mail.to(email);
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe('account-unlock');

    const token = messages[0].text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(token).toBeDefined();
    // The emailed token is the one Redis will accept.
    await expect(loginTracker.peekUnlockTokenForTest(token!)).resolves.toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/unlock')
      .send({ token })
      .expect(204);
  });
});
