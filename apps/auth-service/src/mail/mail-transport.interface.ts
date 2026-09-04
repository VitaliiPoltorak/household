/**
 * Transport-level seam for outbound mail (#319).
 *
 * MailService owns *what* we send (subject, body, the secret inside it);
 * a MailTransport owns *how* it leaves the process. Keeping them apart is
 * what makes the delivery path testable — the integration suite swaps in a
 * collecting fake and asserts the verification code actually reached a
 * transport, without an SMTP server or a real mailbox.
 */
export type MailKind = 'verification-code' | 'account-unlock';

export interface MailMessage {
  /**
   * Log-safe label for this message. Logs must reference `kind`, never
   * `subject`/`text`/`html`: the verification code is deliberately part of the
   * subject line (so it shows in a notification preview) and the unlock token
   * is in the body, and auth-service refuses to log secrets outside
   * AUTH_DEV_LOG_SECRETS (#212).
   */
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  /**
   * Delivers one message. Implementations may throw — MailService treats
   * delivery as best-effort and logs failures rather than failing the
   * surrounding auth request (see mail.service.ts).
   */
  send(message: MailMessage): Promise<void>;

  /** Short human-readable name, used in boot + failure logs. */
  readonly name: string;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
