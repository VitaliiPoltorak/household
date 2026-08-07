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
  providers: [AuthService, GoogleStrategy, AppleStrategy, FacebookStrategy],
})
export class AuthModule {}
