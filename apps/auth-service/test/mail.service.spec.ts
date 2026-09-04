import type { ConfigService } from '@nestjs/config';
import { MailService } from '../src/mail/mail.service';
import { createMailTransport, isSmtpConfigured } from '../src/mail/mail.config';
import { NoopMailTransport } from '../src/mail/noop.transport';
import { SmtpMailTransport } from '../src/mail/smtp.transport';
import type {
  MailMessage,
  MailTransport,
} from '../src/mail/mail-transport.interface';

const makeConfig = (overrides: Record<string, string | undefined> = {}) =>
  ({
    get: (key: string, fallback?: unknown) =>
      overrides[key] ?? (fallback as unknown),
  }) as unknown as ConfigService;

class FakeTransport implements MailTransport {
  readonly name = 'fake';
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Grabs what MailService writes to its own logger, without printing it. */
function captureErrors(mail: MailService): string[] {
  const errors: string[] = [];
  jest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .spyOn((mail as any).logger, 'error')
    .mockImplementation((msg: unknown) => {
      errors.push(String(msg));
    });
  return errors;
}

class ThrowingTransport implements MailTransport {
  readonly name = 'throwing';
  async send(): Promise<void> {
    throw new Error('smtp is down');
  }
}

describe('MailService', () => {
  describe('sendVerificationCode', () => {
    it('delivers the code to the registrant in both text and html parts', async () => {
      const transport = new FakeTransport();
      const mail = new MailService(transport, makeConfig());

      await mail.sendVerificationCode({
        email: 'alice@example.com',
        displayName: 'Alice',
        code: '048213',
      });

      expect(transport.sent).toHaveLength(1);
      const [message] = transport.sent;
      expect(message.kind).toBe('verification-code');
      expect(message.to).toBe('alice@example.com');
      expect(message.subject).toContain('048213');
      expect(message.text).toContain('048213');
      expect(message.html).toContain('048213');
      // TTL default is 900s — the body should tell the user how long they have.
      expect(message.text).toContain('15 minutes');
    });

    it('reports the configured TTL rather than the default', async () => {
      const transport = new FakeTransport();
      const mail = new MailService(
        transport,
        makeConfig({ EMAIL_VERIFICATION_TTL_SEC: '300' }),
      );

      await mail.sendVerificationCode({
        email: 'alice@example.com',
        displayName: 'Alice',
        code: '111111',
      });

      expect(transport.sent[0].text).toContain('5 minutes');
    });

    it('escapes the display name so it cannot inject markup into the html part', async () => {
      const transport = new FakeTransport();
      const mail = new MailService(transport, makeConfig());

      await mail.sendVerificationCode({
        email: 'mallory@example.com',
        displayName: '<img src=x onerror=alert(1)>',
        code: '222222',
      });

      expect(transport.sent[0].html).not.toContain('<img');
      expect(transport.sent[0].html).toContain('&lt;img');
    });
  });

  describe('sendAccountUnlockLink', () => {
    it('builds the unlock URL against WEB_APP_URL, trimming a trailing slash', async () => {
      const transport = new FakeTransport();
      const mail = new MailService(
        transport,
        makeConfig({ WEB_APP_URL: 'https://app.example.com/' }),
      );

      await mail.sendAccountUnlockLink({
        email: 'bob@example.com',
        displayName: 'Bob',
        token: 'a'.repeat(64),
      });

      const [message] = transport.sent;
      expect(message.kind).toBe('account-unlock');
      expect(message.to).toBe('bob@example.com');
      expect(message.text).toContain(
        `https://app.example.com/unlock?token=${'a'.repeat(64)}`,
      );
      expect(message.html).toContain('https://app.example.com/unlock?token=');
    });
  });

  describe('transport failures', () => {
    it('swallows the error so a dead SMTP host cannot fail the surrounding auth request', async () => {
      const mail = new MailService(new ThrowingTransport(), makeConfig());
      await expect(
        mail.sendVerificationCode({
          email: 'alice@example.com',
          displayName: 'Alice',
          code: '333333',
        }),
      ).resolves.toBeUndefined();
    });

    it('never leaks the unlock token into the failure log', async () => {
      const mail = new MailService(new ThrowingTransport(), makeConfig());
      const errors = captureErrors(mail);

      await mail.sendAccountUnlockLink({
        email: 'bob@example.com',
        displayName: 'Bob',
        token: 'deadbeef'.repeat(8),
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).not.toContain('deadbeef');
      // Address is masked, same as everywhere else in auth-service.
      expect(errors[0]).not.toContain('bob@example.com');
    });

    // The code is deliberately part of the subject line, so any log that
    // echoes the subject leaks it. Logs must reference message.kind instead.
    it('never leaks the verification code into the failure log', async () => {
      const mail = new MailService(new ThrowingTransport(), makeConfig());
      const errors = captureErrors(mail);

      await mail.sendVerificationCode({
        email: 'alice@example.com',
        displayName: 'Alice',
        code: '424242',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).not.toContain('424242');
      expect(errors[0]).toContain('verification-code');
    });
  });
});

describe('mail transport selection', () => {
  it('falls back to the drop-and-warn transport when SMTP_HOST is unset', () => {
    expect(isSmtpConfigured(makeConfig())).toBe(false);
    expect(createMailTransport(makeConfig())).toBeInstanceOf(NoopMailTransport);
  });

  it('treats a whitespace-only SMTP_HOST as unconfigured', () => {
    expect(isSmtpConfigured(makeConfig({ SMTP_HOST: '   ' }))).toBe(false);
  });

  it('builds an SMTP transport once SMTP_HOST is set', () => {
    const transport = createMailTransport(
      makeConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' }),
    );
    expect(transport).toBeInstanceOf(SmtpMailTransport);
    expect(transport.name).toBe('smtp');
  });

  // #323 — the local Mailpit catcher speaks plaintext SMTP, so the mandatory
  // STARTTLS default has to be clearable. It must stay an explicit opt-out:
  // a typo or an unset value has to leave TLS required, or a production
  // misconfiguration would silently send codes in the clear.
  describe('SMTP_REQUIRE_TLS', () => {
    const build = (overrides: Record<string, string | undefined>) =>
      createMailTransport(
        makeConfig({ SMTP_HOST: 'smtp.example.com', ...overrides }),
      ) as SmtpMailTransport;

    it('demands TLS by default', () => {
      expect(build({}).isPlaintext).toBe(false);
    });

    it('allows plaintext only for the exact string "false"', () => {
      expect(build({ SMTP_REQUIRE_TLS: 'false' }).isPlaintext).toBe(true);
      expect(build({ SMTP_REQUIRE_TLS: 'true' }).isPlaintext).toBe(false);
      // Anything else — a typo, a stray capital — keeps TLS required.
      expect(build({ SMTP_REQUIRE_TLS: 'FALSE' }).isPlaintext).toBe(false);
      expect(build({ SMTP_REQUIRE_TLS: '0' }).isPlaintext).toBe(false);
      expect(build({ SMTP_REQUIRE_TLS: '' }).isPlaintext).toBe(false);
    });

    it('is moot under implicit TLS — port 465 is already encrypted', () => {
      expect(
        build({ SMTP_SECURE: 'true', SMTP_REQUIRE_TLS: 'false' }).isPlaintext,
      ).toBe(false);
    });
  });
});
