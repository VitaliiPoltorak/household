import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from client' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class AppleAuthDto {
  @ApiProperty({ description: 'Apple ID token from client' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class FacebookAuthDto {
  @ApiProperty({ description: 'Facebook access token from client' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class LogoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

/**
 * Canonical body for the provider-agnostic `POST /auth/oauth/:provider`
 * endpoint. The `meta` field is forwarded verbatim to the strategy for
 * provider-specific extras (e.g. Apple's firstName/lastName).
 */
export class OAuthAuthDto {
  @ApiProperty({ description: 'Provider-issued id_token or access_token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceInfo?: string;

  @ApiPropertyOptional({
    description: 'Optional provider-specific extras (e.g. Apple firstName/lastName).',
    type: Object,
  })
  @IsObject()
  @IsOptional()
  meta?: Record<string, unknown>;
}
