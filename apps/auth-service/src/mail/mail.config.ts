import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailTransport } from './mail-transport.interface';
import { SmtpMailTransport } from './smtp.transport';
import { NoopMailTransport } from './noop.transport';

export const DEFAULT_MAIL_FROM = 'Household <no-reply@localhost>';
export const DEFAULT_WEB_APP_URL = 'http://localhost:5173';

export function isSmtpConfigured(config: ConfigService): boolean {
  return Boolean(config.get<string>('SMTP_HOST', '').trim());
}

/**
 * Builds the transport for this process: SMTP when SMTP_HOST is set,
 * otherwise the drop-and-warn fallback.
 */
export function createMailTransport(config: ConfigService): MailTransport {
  if (!isSmtpConfigured(config)) return new NoopMailTransport();

  return new SmtpMailTransport({
    host: config.get<string>('SMTP_HOST', '').trim(),
    port: Number(config.get<string>('SMTP_PORT', '587')),
    secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
    // Opt-out, not opt-in: an unset or misspelled value keeps TLS mandatory.
    requireTls: config.get<string>('SMTP_REQUIRE_TLS', 'true') !== 'false',
    user: config.get<string>('SMTP_USER') || undefined,
    password: config.get<string>('SMTP_PASSWORD') || undefined,
    from: config.get<string>('MAIL_FROM', DEFAULT_MAIL_FROM),
  });
}

/**
 * Boot-time check. Unlike requireStrongJwtSecret / requireSigningSecret this
 * deliberately does NOT throw in production: a missing mail transport breaks
 * email/password signup, but OAuth login, refresh and every authenticated
 * route still work. Refusing to boot would turn a partial outage into a total
 * one. It logs at ERROR so the gap is loud in the deploy logs instead of
 * silently reproducing #319.
 */
export function warnIfMailTransportMissing(config: ConfigService): void {
  const logger = new Logger('MailConfig');
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  if (!isSmtpConfigured(config)) {
    const message =
      'No SMTP transport configured (SMTP_HOST is empty) — verification codes and unlock links will NOT be delivered. Email/password signup cannot be completed.';

    if (isProduction) {
      logger.error(message);
    } else {
      logger.warn(
        `${message} Start the local mail catcher (docker compose up -d mailpit) or set AUTH_DEV_LOG_SECRETS=true to read codes from the log.`,
      );
    }
    return;
  }

  // Configured, but configured to talk plaintext. Legitimate for a local
  // catcher or a relay on loopback; over a real network it puts verification
  // codes and SMTP credentials in the clear.
  if (config.get<string>('SMTP_REQUIRE_TLS', 'true') === 'false') {
    const message = `SMTP_REQUIRE_TLS=false — mail to ${config.get<string>('SMTP_HOST', '').trim()} is sent without TLS. Only acceptable for a local mail catcher or a loopback relay.`;
    if (isProduction) {
      logger.error(message);
    } else {
      logger.log(message);
    }
  }
}
