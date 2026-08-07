import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import { OAuthProfile } from '../../users/users.service';
import { IOAuthStrategy } from './oauth-strategy.interface';

@Injectable()
export class AppleStrategy implements IOAuthStrategy {
  readonly provider = 'apple';

  constructor(private readonly config: ConfigService) {}

  async validate(
    idToken: string,
    meta?: Record<string, unknown>,
  ): Promise<OAuthProfile> {
    try {
      const payload = await appleSignin.verifyIdToken(idToken, {
        audience: this.config.get('APPLE_CLIENT_ID'),
      });
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid Apple token payload');
      }

      const firstName =
        typeof meta?.firstName === 'string' ? meta.firstName : undefined;
      const lastName =
        typeof meta?.lastName === 'string' ? meta.lastName : undefined;

      const email = payload.email || `${payload.sub}@privaterelay.appleid.com`;
      let displayName = email.split('@')[0];
      if (firstName || lastName) {
        displayName = [firstName, lastName].filter(Boolean).join(' ');
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
