import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body used only by mobile clients (X-Client-Platform: mobile) — web relies
 * on the HttpOnly refresh cookie + CSRF header instead and ignores this body.
 * See #356.
 */
export class RefreshDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
