import { Logger } from '@nestjs/common';
import { maskEmail } from '@household/common';
import { MailMessage, MailTransport } from './mail-transport.interface';

/**
 * Fallback transport used when no SMTP host is configured — every message is
 * dropped and recorded at WARN.
 *
 * It exists so local dev and the test suite don't need an SMTP server: with
 * AUTH_DEV_LOG_SECRETS=true the verification code is already logged by
 * AuthService, so a developer can still complete register → verify.
 *
 * Neither the subject nor the body is logged: both carry a secret (the code
 * is in the subject line, the unlock token is in the body), and logging
 * secrets is gated behind AUTH_DEV_LOG_SECRETS, which production refuses
 * outright (#212). Only the message kind is recorded.
 */
export class NoopMailTransport implements MailTransport {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopMailTransport.name);

  async send(message: MailMessage): Promise<void> {
    this.logger.warn(
      `Mail not sent (no SMTP transport configured): ${message.kind} for ${maskEmail(message.to)}`,
    );
  }
}
