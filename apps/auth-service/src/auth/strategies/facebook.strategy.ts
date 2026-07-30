import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuthProfile } from '../../users/users.service';

interface FacebookUserResponse {
  id: string;
  email?: string;
  name?: string;
  picture?: { data?: { url?: string } };
}

@Injectable()
export class FacebookStrategy {
  async validate(accessToken: string): Promise<OAuthProfile> {
    try {
      const url = `https://graph.facebook.com/me?fields=id,email,name,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new UnauthorizedException('Invalid Facebook token');
      }
      const data = (await res.json()) as FacebookUserResponse;
      if (!data.id) {
        throw new UnauthorizedException('Invalid Facebook response');
      }
      return {
        provider: 'facebook',
        providerUserId: data.id,
        email: data.email || `${data.id}@facebook.com`,
        displayName: data.name || 'Facebook User',
        avatarUrl: data.picture?.data?.url,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Facebook authentication failed');
    }
  }
}
