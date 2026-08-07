import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { getAccessTtlSeconds } from '@household/common';
import { UsersService, OAuthProfile } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { KafkaProducerService } from '@household/kafka';
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
    private readonly kafka: KafkaProducerService,
  ) {
    this.accessExpiresIn = getAccessTtlSeconds(config);
  }

  async loginWithOAuth(
    profile: OAuthProfile,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    const { user, isNew } = await this.users.findOrCreateByOAuth(profile);

    if (isNew) {
      await this.kafka.emit('auth.user.created', {
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
    const session = await this.sessions.validateRefreshToken(
      sessionId,
      refreshToken,
    );
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.sessions.deleteSession(sessionId);

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(user, deviceInfo);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.deleteSession(sessionId);
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

    await this.kafka.emit('auth.user.deleted', { userId });
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
