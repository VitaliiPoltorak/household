import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from '../src/auth/strategies/google.strategy';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

describe('GoogleStrategy audiences (#359)', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 's', email: 'a@b.c', name: 'A' }),
    });
  });

  it('accepts only the web client id when no mobile ids are configured', async () => {
    const s = new GoogleStrategy(config({ GOOGLE_CLIENT_ID: 'web' }));
    await s.validate('tok');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: ['web'],
    });
  });

  it('adds trimmed mobile client ids and drops empty entries', async () => {
    const s = new GoogleStrategy(
      config({ GOOGLE_CLIENT_ID: 'web', GOOGLE_MOBILE_CLIENT_IDS: ' ios , ,and' }),
    );
    await s.validate('tok');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: ['web', 'ios', 'and'],
    });
  });

  it('maps a verification failure to 401', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad aud'));
    const s = new GoogleStrategy(config({ GOOGLE_CLIENT_ID: 'web' }));
    await expect(s.validate('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
