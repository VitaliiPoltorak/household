import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /auth/password/set (#329).
 *
 * No `currentPassword` field, deliberately — the endpoint is only valid for an
 * account that has none, and accepting one would invite a client to send a
 * value that is never checked. Strength (zxcvbn >= 3) and breach (HIBP) are
 * enforced in AuthService against the same bar as register, so the rule lives
 * in one place rather than drifting per DTO.
 */
export class SetPasswordDto {
  @ApiProperty({ description: 'Minimum 12 characters', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'newPassword must be at least 12 characters' })
  newPassword: string;
}
