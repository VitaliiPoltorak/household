import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskEmail } from '@household/common';
import {
  MAIL_TRANSPORT,
  MailMessage,
  MailTransport,
} from './mail-transport.interface';
import { DEFAULT_WEB_APP_URL } from './mail.config';

/**
 * Composes and dispatches the transactional emails the auth flows depend on
 * (#319). Before this existed, `register` only put the code in Redis and
 * published a Kafka event for a notification-service that does not exist yet
 * (#30) — so on production no code ever reached a mailbox and email/password
 * signup was a dead end.
 *
 * The Kafka events are still emitted by AuthService: when notification-service
 * lands it becomes an additional consumer, and this direct path can be
 * retired by swapping the transport for a no-op.
 *
 * Delivery is best-effort. A transport failure is logged, never rethrown:
 * `register` has already created the user row, so turning an SMTP blip into a
 * 500 would leave an unverified account behind with the caller believing
 * nothing happened. The user's recovery path is the resend endpoint.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly webAppUrl: string;
  private readonly verificationTtlMin: number;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    config: ConfigService,
  ) {
    this.webAppUrl = config
      .get<string>('WEB_APP_URL', DEFAULT_WEB_APP_URL)
      .replace(/\/+$/, '');
    this.verificationTtlMin = Math.max(
      1,
      Math.round(
        Number(config.get<string>('EMAIL_VERIFICATION_TTL_SEC', '900')) / 60,
      ),
    );
  }

  async sendVerificationCode(input: {
    email: string;
    displayName: string;
    code: string;
  }): Promise<void> {
    const name = escapeHtml(input.displayName);
    const minutes = this.verificationTtlMin;

    await this.deliver({
      kind: 'verification-code',
      to: input.email,
      subject: `${input.code} is your Household verification code`,
      text: [
        `Hi ${input.displayName},`,
        '',
        'Your Household verification code is:',
        '',
        `    ${input.code}`,
        '',
        `The code expires in ${minutes} minutes. If you didn't create a Household account, you can ignore this email.`,
      ].join('\n'),
      html: layout(
        'Confirm your email',
        `<p>Hi ${name},</p>
         <p>Your Household verification code is:</p>
         <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0;">${input.code}</p>
         <p>The code expires in ${minutes} minutes. If you didn't create a Household account, you can ignore this email.</p>`,
      ),
    });
  }

  async sendAccountUnlockLink(input: {
    email: string;
    displayName: string;
    token: string;
  }): Promise<void> {
    const name = escapeHtml(input.displayName);
    // The token is URL-safe hex (randomBytes.toString('hex')), but encode it
    // anyway so the link stays correct if the token format ever changes.
    const url = `${this.webAppUrl}/unlock?token=${encodeURIComponent(input.token)}`;
    const safeUrl = escapeHtml(url);

    await this.deliver({
      kind: 'account-unlock',
      to: input.email,
      subject: 'Unlock your Household account',
      text: [
        `Hi ${input.displayName},`,
        '',
        'Your Household account was locked after too many failed sign-in attempts.',
        'Open the link below to unlock it, then sign in again:',
        '',
        url,
        '',
        "If this wasn't you, someone may be trying to guess your password — consider changing it after you sign in.",
      ].join('\n'),
      html: layout(
        'Unlock your account',
        `<p>Hi ${name},</p>
         <p>Your Household account was locked after too many failed sign-in attempts.</p>
         <p><a href="${safeUrl}">Unlock my account</a></p>
         <p>If this wasn't you, someone may be trying to guess your password — consider changing it after you sign in.</p>`,
      ),
    });
  }

  private async deliver(message: MailMessage): Promise<void> {
    try {
      await this.transport.send(message);
    } catch (err) {
      // Log the kind, never the subject or body — the code is in the subject
      // line and the unlock token is in the body.
      this.logger.error(
        `Failed to deliver ${message.kind} mail to ${maskEmail(message.to)} via ${this.transport.name}: ${(err as Error).message}`,
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
    ${body}
    <p style="margin-top:32px;font-size:12px;color:#6b7280;">Household — family finance &amp; shopping</p>
  </div>
</body></html>`;
}
