import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { OAuthProfile } from '../../users/users.service';

@Injectable()
export class GoogleStrategy {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.client = new OAuth2Client(config.get('GOOGLE_CLIENT_ID'));
  }

  async validate(idToken: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token payload');
      }
      return {
        provider: 'google',
        providerUserId: payload.sub,
        email: payload.email,
        displayName: payload.name || payload.email.split('@')[0],
        avatarUrl: payload.picture,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
