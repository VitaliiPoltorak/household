import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { getAccessTtlSeconds } from '@household/common';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { UsersService, OAuthProfile } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { User } from '../users/entities/user.entity';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly accessExpiresIn: number;

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
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
