import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { maskEmail } from '@household/common';
import { MailMessage, MailTransport } from './mail-transport.interface';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  /**
   * Demand a TLS upgrade on a non-`secure` connection. Defaults to true and
   * must stay true against any real provider. The one legitimate reason to
   * turn it off is a local mail catcher (Mailpit) that speaks plaintext SMTP
   * on the loopback/compose network and never sees a real address.
   */
  requireTls: boolean;
  user?: string;
  password?: string;
  from: string;
}

/**
 * Nodemailer-over-SMTP transport. SMTP (rather than a provider SDK) keeps the
 * service portable across Resend / Postmark / Mailgun / SES / a self-hosted
 * relay — every one of them speaks SMTP, so switching providers is an env
 * change, not a code change.
 */
export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp';
  private readonly logger = new Logger(SmtpMailTransport.name);
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      // `secure: true` means implicit TLS (port 465). On 587 nodemailer
      // upgrades via STARTTLS, which `requireTLS` makes mandatory rather
      // than opportunistic — without it a downgrade leaves the credentials
      // and the verification code on the wire in plaintext. Only a local
      // catcher should ever clear it (see SMTP_REQUIRE_TLS).
      secure: options.secure,
      requireTLS: !options.secure && options.requireTls,
      auth:
        options.user && options.password
          ? { user: options.user, pass: options.password }
          : undefined,
    });
  }

  /** True when this transport will put messages on the wire unencrypted. */
  get isPlaintext(): boolean {
    return !this.options.secure && !this.options.requireTls;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.log(
      `Sent ${message.kind} mail to ${maskEmail(message.to)} via SMTP`,
    );
  }
}
