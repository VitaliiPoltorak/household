import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  requireStrongJwtSecret,
  JWT_ALGORITHMS,
  requireCoherentTokenTtls,
} from '@household/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { GoogleStrategy } from './strategies/google.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { OAUTH_STRATEGIES } from './strategies/oauth-strategy.interface';
import { OAuthStrategyRegistry } from './strategies/oauth-strategy.registry';
import { PasswordHasherService } from './password-hasher.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailThrottlerService } from './email-throttler.service';
import { HibpService } from './hibp.service';
import { PasswordComplexityService } from './password-complexity.service';
import { LoginAttemptTrackerService } from './login-attempt-tracker.service';
@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { accessTtl } = requireCoherentTokenTtls(config);
        return {
          secret: requireStrongJwtSecret(config),
          signOptions: {
            expiresIn: accessTtl,
            algorithm: JWT_ALGORITHMS[0],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Concrete strategies stay as standalone providers so they can be injected
    // directly (and so `useExisting` below has a real instance to alias).
    GoogleStrategy,
    AppleStrategy,
    FacebookStrategy,
    // Registered OAuth strategies — the registry receives all of them as an
    // array via `@Inject(OAUTH_STRATEGIES)`. Adding a new provider = new
    // strategy class + adding it to this factory's `inject` list. No
    // controller edits required.
    //
    // Nest v10's `Provider` type does not expose the `multi: true` field, so
    // instead of contributing individual multi-bindings we assemble the array
    // in a single factory. Same runtime effect — same singleton instances
    // reach the registry — and it stays type-safe under Nest v10.
    {
      provide: OAUTH_STRATEGIES,
      useFactory: (
        google: GoogleStrategy,
        apple: AppleStrategy,
        facebook: FacebookStrategy,
      ) => [google, apple, facebook],
      inject: [GoogleStrategy, AppleStrategy, FacebookStrategy],
    },
    OAuthStrategyRegistry,
    PasswordHasherService,
    EmailVerificationService,
    EmailThrottlerService,
    HibpService,
    PasswordComplexityService,
    LoginAttemptTrackerService,
  ],
})
export class AuthModule {}
