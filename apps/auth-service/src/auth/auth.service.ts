import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { getAccessTtlSeconds, maskId } from '@household/common';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { UsersService, OAuthProfile } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { User } from '../users/entities/user.entity';
import { PasswordHasherService } from './password-hasher.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailThrottlerService } from './email-throttler.service';
import { HibpService } from './hibp.service';
import { PasswordComplexityService } from './password-complexity.service';
import { LoginAttemptTrackerService } from './login-attempt-tracker.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

/** Registration returns no tokens — the user must verify first. */
export interface RegisterResult {
  userId: string;
  email: string;
}

const PASSWORD_PROVIDER = 'password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessExpiresIn: number;

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
    private readonly hasher: PasswordHasherService,
    private readonly verification: EmailVerificationService,
    private readonly emailThrottler: EmailThrottlerService,
    private readonly complexity: PasswordComplexityService,
    private readonly hibp: HibpService,
    private readonly loginTracker: LoginAttemptTrackerService,
  ) {
    this.accessExpiresIn = getAccessTtlSeconds(config);
  }

  async loginWithOAuth(
    profile: OAuthProfile,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    const { user, isNew } = await this.users.findOrCreateByOAuth(profile);

    if (isNew) {
      await this.events.emit('auth.user.created', {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        provider: profile.provider,
      });
    }

    return this.generateTokens(user, deviceInfo);
  }

  /**
   * Manual signup. Order of checks matters:
   *   1. Rate limit (fast, no work if abused)
   *   2. Duplicate email (409 — the enumeration signal we accept)
   *   3. zxcvbn score (in-process, no network)
   *   4. HIBP breach corpus (network, fail-open)
   *   5. Hash + persist + issue verification code
   * Returns no access token — the caller must verify the mailbox first.
   */
  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<RegisterResult> {
    await this.emailThrottler.consume('register', input.email);

    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    // zxcvbn is primed with the user's own email + displayName so passwords
    // derived from them (e.g. "alice@example.com" + "AliceExample123") drop
    // in score. Server-side check — the client can also run zxcvbn for live
    // feedback, but we must not trust the client verdict.
    const complexity = this.complexity.check(input.password, [
      input.email,
      input.displayName,
    ]);
    if (!complexity.ok) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password is too easy to guess. Try a longer or less common phrase.',
        score: complexity.score,
        warning: complexity.warning,
        suggestions: complexity.suggestions,
      });
    }

    const breach = await this.hibp.check(input.password);
    if (breach.breached) {
      throw new BadRequestException({
        code: 'PASSWORD_PWNED',
        message:
          'This password has appeared in a public breach and is unsafe to use. Please choose another.',
        // We deliberately DO NOT expose the exact count — an attacker could
        // use it to fingerprint which known-breached password a user picked.
        // "appears in a breach" is the actionable signal.
      });
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.createWithPassword({
      email: input.email,
      displayName: input.displayName,
      passwordHash,
    });

    const code = await this.verification.issueCode(user.email);
    await this.events.emit('auth.email.verification_requested', {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    // Dev-only: log the code so integration testers / Postman users can
    // proceed without a real mailbox. Never include the code in an API
    // response or Kafka payload — notification-service (#30) will be the
    // legitimate reader once it lands, and it can read Redis directly.
    this.logger.log(
      `[dev-only] verification code for ${user.email}: ${code}`,
    );

    return { userId: user.id, email: user.email };
  }

  /**
   * Verifies the 6-digit code, marks the user verified, emits
   * auth.user.created, and returns a full LoginResponse — the user is signed
   * in as a side effect of successful verification, so they don't have to
   * bounce through the login form immediately after.
   */
  async verifyEmail(input: {
    email: string;
    code: string;
    deviceInfo?: string;
  }): Promise<TokenPair> {
    await this.emailThrottler.consume('verify-email', input.email);

    const result = await this.verification.verifyCode(input.email, input.code);
    if (result.status === 'missing') {
      throw new BadRequestException({
        code: 'CODE_EXPIRED_OR_MISSING',
        message: 'Verification code has expired or was never issued. Request a new one.',
      });
    }
    if (result.status === 'exhausted') {
      throw new BadRequestException({
        code: 'CODE_ATTEMPTS_EXHAUSTED',
        message: 'Too many wrong attempts. Request a new code.',
      });
    }
    if (result.status === 'wrong') {
      throw new BadRequestException({
        code: 'CODE_INVALID',
        message: 'Verification code is incorrect.',
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    // Load AFTER the code check so brute-forcing the code against a made-up
    // email doesn't touch the DB. If the code was correct but the user was
    // deleted between register and verify, log and return a soft error.
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      this.logger.warn(
        `verifyEmail: code was valid but user is gone for ${input.email}`,
      );
      throw new BadRequestException({
        code: 'CODE_EXPIRED_OR_MISSING',
        message: 'Verification code has expired or was never issued. Request a new one.',
      });
    }

    if (!user.emailVerifiedAt) {
      await this.users.markEmailVerified(user.id);
      await this.events.emit('auth.user.created', {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        provider: PASSWORD_PROVIDER,
      });
    }

    return this.generateTokens(user, input.deviceInfo);
  }

  /**
   * Regenerates the verification code and rotates the attempts counter. We
   * intentionally do NOT disclose whether the email is registered or already
   * verified — response shape is uniform, so an attacker can't map the user
   * base via the resend endpoint. Only the throttler and the "no work
   * happens" branch see reality.
   */
  async resendVerification(email: string): Promise<void> {
    await this.emailThrottler.consume('resend-verification', email);

    const user = await this.users.findByEmail(email);
    if (!user) {
      this.logger.debug(`resendVerification: no user for ${email} — silent no-op`);
      return;
    }
    if (user.emailVerifiedAt) {
      this.logger.debug(
        `resendVerification: user ${maskId(user.id)} already verified — silent no-op`,
      );
      return;
    }

    const code = await this.verification.issueCode(user.email);
    await this.events.emit('auth.email.verification_requested', {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    this.logger.log(
      `[dev-only] verification code for ${user.email}: ${code}`,
    );
  }

  /**
   * Email + password login. Layered checks — request-rate limit (per email),
   * then soft-lock state, then password verify, then verification status.
   * Same generic 401 for wrong-email / wrong-password / OAuth-only account
   * to prevent enumeration. Failed attempts feed the per-account soft-lock
   * counter; the 5th failure locks the account and emits an unlock link.
   * Successful login clears the counter and rehashes the password if the
   * stored parameters fall below current Argon2 policy.
   */
  async loginWithPassword(input: {
    email: string;
    password: string;
    deviceInfo?: string;
  }): Promise<TokenPair> {
    await this.emailThrottler.consume('login', input.email);

    // Soft-lock check runs BEFORE we touch the DB or the hasher. This means
    // a locked account short-circuits regardless of what the caller sends,
    // and we never inadvertently reveal "correct password on locked account"
    // via timing.
    if (await this.loginTracker.isLocked(input.email)) {
      throw new ForbiddenException({
        code: 'ACCOUNT_LOCKED',
        message:
          'Too many failed attempts. Check your email for an unlock link, then try again.',
      });
    }

    const user = await this.users.findByEmail(input.email);

    // No user, or user has no password hash (OAuth-only): burn the same
    // Argon2 CPU/memory work the real check would take so timing doesn't
    // reveal which state we're in. We do NOT record this as a "failed
    // attempt" against an account — there's no account to track.
    if (!user || !user.passwordHash) {
      await this.hasher.compareDummy(input.password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.hasher.compare(input.password, user.passwordHash);
    if (!ok) {
      const result = await this.loginTracker.recordFailure(input.email, user.id);
      if (result.status === 'lockedNow') {
        await this.events.emit('auth.account.locked', {
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
        });
        this.logger.log(
          `[dev-only] unlock token for ${user.email}: ${result.unlockToken}`,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Password matched — clear the failure counter regardless of the next
    // check outcome. A user who was 4-attempts-deep should reset after
    // proving they know the password even if they still have to verify email.
    await this.loginTracker.recordSuccess(input.email);

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirm your email address to sign in.',
        email: user.email,
      });
    }

    // Migrate the stored hash to current policy if it's below spec. Best-
    // effort: an error here should not fail an otherwise-successful login,
    // it just means the user carries a weaker hash for another cycle.
    if (this.hasher.needsRehash(user.passwordHash)) {
      try {
        const newHash = await this.hasher.hash(input.password);
        await this.users.updatePasswordHash(user.id, newHash);
        this.logger.log(
          `Rehashed password for ${maskId(user.id)} to current Argon2 policy`,
        );
      } catch (err) {
        this.logger.warn(
          `Rehash-on-login failed for ${maskId(user.id)}: ${(err as Error).message}`,
        );
      }
    }

    return this.generateTokens(user, input.deviceInfo);
  }

  /**
   * Consumes a single-use unlock token (from the account-locked email) and
   * clears the soft-lock. Returns 204 semantics — no body — so no
   * information leaks about which account the token belonged to.
   */
  async unlockAccount(token: string): Promise<void> {
    const result = await this.loginTracker.consumeUnlockToken(
      token,
      async (userId: string) => {
        const user = await this.users.findById(userId);
        return user?.email ?? null;
      },
    );
    if (result.status === 'invalid') {
      throw new BadRequestException({
        code: 'INVALID_UNLOCK_TOKEN',
        message: 'Unlock link is invalid or has expired.',
      });
    }
  }

  async refresh(
    sessionId: string,
    refreshToken: string,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    const result = await this.sessions.consumeSession(sessionId, refreshToken);

    if (result.status === 'reused') {
      // Reuse-after-rotation: same sessionId presented twice. One of the two
      // callers is an attacker holding a token we already retired. Since we
      // can't tell which, revoke every session for that user — industry
      // standard for OAuth 2.0 rotation reuse detection.
      await this.sessions.deleteAllUserSessions(result.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (result.status === 'invalid') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.users.findById(result.session.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(user, deviceInfo);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.deleteSession(sessionId);
  }

  // Revokes every session for the user (all devices). Used both by the
  // logout-all endpoint and by refresh-token-reuse detection above.
  async logoutAll(userId: string): Promise<void> {
    await this.sessions.deleteAllUserSessions(userId);
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async updateProfile(
    userId: string,
    data: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'locale'>>,
  ): Promise<User> {
    return this.users.updateProfile(userId, data);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.sessions.deleteAllUserSessions(userId);
    await this.users.deleteUser(userId);

    await this.events.emit('auth.user.deleted', { userId });
  }

  private async generateTokens(
    user: User,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwt.sign(payload);
    const refreshToken = randomUUID();

    const sessionId = await this.sessions.createSession(
      user.id,
      refreshToken,
      deviceInfo,
    );

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: this.accessExpiresIn,
    };
  }
}
