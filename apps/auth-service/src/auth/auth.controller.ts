import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Headers,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import {
  GoogleAuthDto,
  AppleAuthDto,
  FacebookAuthDto,
  RefreshTokenDto,
  LogoutDto,
} from './dto/oauth-callback.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleStrategy,
    private readonly apple: AppleStrategy,
    private readonly facebook: FacebookStrategy,
  ) {}

  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google' })
  async googleAuth(@Body() dto: GoogleAuthDto) {
    const profile = await this.google.validate(dto.idToken);
    return this.auth.loginWithOAuth(profile, dto.deviceInfo);
  }

  @Post('apple')
  @ApiOperation({ summary: 'Sign in with Apple' })
  async appleAuth(@Body() dto: AppleAuthDto) {
    const profile = await this.apple.validate(dto.idToken, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return this.auth.loginWithOAuth(profile, dto.deviceInfo);
  }

  @Post('facebook')
  @ApiOperation({ summary: 'Sign in with Facebook' })
  async facebookAuth(@Body() dto: FacebookAuthDto) {
    const profile = await this.facebook.validate(dto.accessToken);
    return this.auth.loginWithOAuth(profile, dto.deviceInfo);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.sessionId, dto.refreshToken, dto.deviceInfo);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidate refresh token' })
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.sessionId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiHeader({ name: 'x-user-id', required: true })
  async getProfile(@Headers('x-user-id') userId: string) {
    this.requireUserId(userId);
    const user = await this.auth.getProfile(userId);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      createdAt: user.createdAt,
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile' })
  @ApiHeader({ name: 'x-user-id', required: true })
  async updateProfile(
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    this.requireUserId(userId);
    const user = await this.auth.updateProfile(userId, dto);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      createdAt: user.createdAt,
    };
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete account (GDPR)' })
  @ApiHeader({ name: 'x-user-id', required: true })
  async deleteAccount(@Headers('x-user-id') userId: string) {
    this.requireUserId(userId);
    await this.auth.deleteAccount(userId);
  }

  private requireUserId(userId: string | undefined): asserts userId is string {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
  }
}
