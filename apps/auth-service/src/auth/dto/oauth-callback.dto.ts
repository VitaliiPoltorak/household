import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
