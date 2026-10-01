import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { OAuthProfile } from '../../users/users.service';
import { IOAuthStrategy } from './oauth-strategy.interface';

@Injectable()
export class GoogleStrategy implements IOAuthStrategy {
  readonly provider = 'google';
  private readonly client: OAuth2Client;
  private readonly audiences: string[];

  constructor(private readonly config: ConfigService) {
    const webClientId = config.get<string>('GOOGLE_CLIENT_ID');
    // Native apps (#359) sign in with their own iOS/Android OAuth client IDs,
    // so the id token's `aud` is that client, not the web one. Extra IDs are
    // opt-in via a comma-separated list; unset keeps web-only behaviour.
    const mobileClientIds = (
      config.get<string>('GOOGLE_MOBILE_CLIENT_IDS') ?? ''
    )
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    this.audiences = [webClientId, ...mobileClientIds].filter(
      (id): id is string => !!id,
    );
    this.client = new OAuth2Client(webClientId);
  }

  async validate(idToken: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences,
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
