import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Headers,
  Param,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OAuthStrategyRegistry } from './strategies/oauth-strategy.registry';
import {
  GoogleAuthDto,
  AppleAuthDto,
  FacebookAuthDto,
  OAuthAuthDto,
  RefreshTokenDto,
  LogoutDto,
} from './dto/oauth-callback.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registry: OAuthStrategyRegistry,
  ) {}

  // Provider-specific endpoints are retained for backward compatibility with
  // existing web/mobile clients (see apps/web/src/api/auth.ts). New providers
  // should use the canonical `POST /auth/oauth/:provider` below.

  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google' })
  async googleAuth(@Body() dto: GoogleAuthDto) {
    const profile = await this.registry.get('google').validate(dto.idToken);
    return this.auth.loginWithOAuth(profile, dto.deviceInfo);
  }

  @Post('apple')
  @ApiOperation({ summary: 'Sign in with Apple' })
  async appleAuth(@Body() dto: AppleAuthDto) {
    const profile = await this.registry.get('apple').validate(dto.idToken, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return this.auth.loginWithOAuth(profile, dto.deviceInfo);
  }

  @Post('facebook')
  @ApiOperation({ summary: 'Sign in with Facebook' })
  async facebookAuth(@Body() dto: FacebookAuthDto) {
    const profile = await this.registry
      .get('facebook')
      .validate(dto.accessToken);
    return this.auth.loginWithOAuth(profile, dto.deviceInfo);
  }

  /**
   * Canonical, provider-agnostic OAuth endpoint. Resolves the strategy via
   * {@link OAuthStrategyRegistry} — adding a new provider requires zero
   * controller edits.
   */
  @Post('oauth/:provider')
  @ApiOperation({ summary: 'Sign in with any registered OAuth provider' })
  @ApiParam({ name: 'provider', description: 'Provider slug (e.g. google, apple, facebook)' })
  async oauth(
    @Param('provider') provider: string,
    @Body() dto: OAuthAuthDto,
  ) {
    const profile = await this.registry
      .get(provider)
      .validate(dto.token, dto.meta);
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

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out from all devices — revokes every session for this user' })
  @ApiHeader({ name: 'x-user-id', required: true })
  async logoutAll(@Headers('x-user-id') userId: string) {
    this.requireUserId(userId);
    await this.auth.logoutAll(userId);
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
