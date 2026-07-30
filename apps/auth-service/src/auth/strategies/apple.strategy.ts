import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import { OAuthProfile } from '../../users/users.service';

@Injectable()
export class AppleStrategy {
  constructor(private readonly config: ConfigService) {}

  async validate(
    idToken: string,
    user?: { firstName?: string; lastName?: string },
  ): Promise<OAuthProfile> {
    try {
      const payload = await appleSignin.verifyIdToken(idToken, {
        audience: this.config.get('APPLE_CLIENT_ID'),
      });
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid Apple token payload');
      }

      const email = payload.email || `${payload.sub}@privaterelay.appleid.com`;
      let displayName = email.split('@')[0];
      if (user?.firstName || user?.lastName) {
        displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      }

      return {
        provider: 'apple',
        providerUserId: payload.sub,
        email,
        displayName,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid Apple token');
    }
  }
}
