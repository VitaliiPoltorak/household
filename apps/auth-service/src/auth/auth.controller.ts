import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Headers,
  Param,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { getRefreshTtlSeconds } from '@household/common';
import { Audit } from '@household/audit';
import { AuthService, TokenPair } from './auth.service';
import { OAuthStrategyRegistry } from './strategies/oauth-strategy.registry';
import {
  GoogleAuthDto,
  AppleAuthDto,
  FacebookAuthDto,
  OAuthAuthDto,
} from './dto/oauth-callback.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginWithPasswordDto } from './dto/login-with-password.dto';
import { UnlockAccountDto } from './dto/unlock-account.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  clearAuthCookies,
  generateCsrfToken,
  readRefreshCookie,
  setAuthCookies,
  verifyCsrf,
} from './cookies';

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly refreshTtlSec: number;
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly registry: OAuthStrategyRegistry,
    private readonly config: ConfigService,
  ) {
    this.refreshTtlSec = getRefreshTtlSeconds(config);
    // Secure defaults to true. Only opt out for explicit local HTTP dev.
    // Browsers require SameSite=None cookies to also be Secure — EXCEPT on
    // localhost, where Chrome/FF allow Secure over http.
    this.cookieSecure = config.get<string>('AUTH_COOKIE_SECURE', 'true') !== 'false';
  }

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register with email + password (mailbox verification required)',
  })
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
    });
    // 202 + narrow body: no access token yet, the caller must verify first.
    return { userId: result.userId, email: result.email };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the 6-digit code and sign in',
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const tokens = await this.auth.verifyEmail({
      email: dto.email,
      code: dto.code,
      deviceInfo: dto.deviceInfo,
    });
    return this.buildLoginResponse(tokens, res);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Regenerate the verification code' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    // Uniform 202 no matter what the underlying state is — do not disclose
    // whether the email is registered or already verified.
    await this.auth.resendVerification(dto.email);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email + password' })
  async login(
    @Body() dto: LoginWithPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const tokens = await this.auth.loginWithPassword({
      email: dto.email,
      password: dto.password,
      deviceInfo: dto.deviceInfo,
    });
    return this.buildLoginResponse(tokens, res);
  }

  @Post('unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Consume a single-use unlock token from the account-locked email',
  })
  async unlock(@Body() dto: UnlockAccountDto): Promise<void> {
    await this.auth.unlockAccount(dto.token);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.password.change', resourceType: 'user' })
  @ApiOperation({
    summary:
      'Change the account password. Revokes every other session and returns a fresh one for this device.',
  })
  @ApiHeader({ name: 'x-user-id', required: true })
  async changePassword(
    @Headers('x-user-id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    this.requireUserId(userId);
    const tokens = await this.auth.changePassword(userId, {
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
      deviceInfo: dto.deviceInfo,
    });
    return this.buildLoginResponse(tokens, res);
  }

  // Provider-specific endpoints are retained for backward compatibility with
  // existing web/mobile clients (see apps/web/src/api/auth.ts). New providers
  // should use the canonical `POST /auth/oauth/:provider` below.

  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google' })
  async googleAuth(
    @Body() dto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const profile = await this.registry.get('google').validate(dto.idToken);
    const tokens = await this.auth.loginWithOAuth(profile, dto.deviceInfo);
    return this.buildLoginResponse(tokens, res);
  }

  @Post('apple')
  @ApiOperation({ summary: 'Sign in with Apple' })
  async appleAuth(
    @Body() dto: AppleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const profile = await this.registry.get('apple').validate(dto.idToken, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const tokens = await this.auth.loginWithOAuth(profile, dto.deviceInfo);
    return this.buildLoginResponse(tokens, res);
  }

  @Post('facebook')
  @ApiOperation({ summary: 'Sign in with Facebook' })
  async facebookAuth(
    @Body() dto: FacebookAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const profile = await this.registry
      .get('facebook')
      .validate(dto.accessToken);
    const tokens = await this.auth.loginWithOAuth(profile, dto.deviceInfo);
    return this.buildLoginResponse(tokens, res);
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
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const profile = await this.registry
      .get(provider)
      .validate(dto.token, dto.meta);
    const tokens = await this.auth.loginWithOAuth(profile, dto.deviceInfo);
    return this.buildLoginResponse(tokens, res);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token (reads HttpOnly cookie + CSRF header)' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    // Double-submit CSRF: cookie value must match X-CSRF-Token header. This
    // is the only endpoint with cookie-auth on the request side, so it's the
    // only endpoint that needs CSRF. Bearer-auth endpoints are already
    // CSRF-immune (attacker can't set Authorization cross-origin).
    if (!verifyCsrf(req)) {
      throw new ForbiddenException('CSRF token missing or invalid');
    }
    const payload = readRefreshCookie(req);
    if (!payload) {
      throw new UnauthorizedException('Missing refresh cookie');
    }
    const tokens = await this.auth.refresh(payload.sessionId, payload.refreshToken);
    return this.buildLoginResponse(tokens, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidate refresh cookie for the current session' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // No CSRF check on logout: worst case an attacker forces a logout, which
    // is annoying but not a data-integrity problem. Keeps the client simple.
    const payload = readRefreshCookie(req);
    if (payload) {
      await this.auth.logout(payload.sessionId);
    }
    clearAuthCookies(res, { secure: this.cookieSecure });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.logout_all', resourceType: 'user' })
  @ApiOperation({ summary: 'Sign out from all devices — revokes every session for this user' })
  @ApiHeader({ name: 'x-user-id', required: true })
  async logoutAll(
    @Headers('x-user-id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    this.requireUserId(userId);
    await this.auth.logoutAll(userId);
    // Also clear this device's cookies — the current session was just revoked.
    clearAuthCookies(res, { secure: this.cookieSecure });
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
  @Audit({ action: 'auth.account.delete', resourceType: 'user' })
  @ApiOperation({ summary: 'Delete account (GDPR)' })
  @ApiHeader({ name: 'x-user-id', required: true })
  async deleteAccount(
    @Headers('x-user-id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    this.requireUserId(userId);
    await this.auth.deleteAccount(userId);
    // User no longer exists; clear their cookies on this device.
    clearAuthCookies(res, { secure: this.cookieSecure });
  }

  private requireUserId(userId: string | undefined): asserts userId is string {
    if (!userId) throw new UnauthorizedException('Missing X-User-Id header');
  }

  // Common tail for all login / refresh endpoints: stamp the HttpOnly refresh
  // cookie + the readable CSRF cookie, return only the access token in the
  // body. Session id and refresh token never touch the response body.
  private buildLoginResponse(tokens: TokenPair, res: Response): LoginResponse {
    setAuthCookies(
      res,
      { sessionId: tokens.sessionId, refreshToken: tokens.refreshToken },
      generateCsrfToken(),
      { maxAgeSec: this.refreshTtlSec, secure: this.cookieSecure },
    );
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
}
