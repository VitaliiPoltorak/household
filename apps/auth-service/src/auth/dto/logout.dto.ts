import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body used only by mobile clients (X-Client-Platform: mobile) — web has no
 * session id to send (it never leaves the HttpOnly cookie) and relies on the
 * cookie-based logout path instead. See #356.
 */
export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;
}
