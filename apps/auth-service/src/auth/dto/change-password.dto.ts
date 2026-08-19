import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChangePasswordDto {
  // Only length ≥ 1 on the current password — real validation is bcrypt/
  // Argon2 verify against the stored hash. A user whose current password
  // predates a stricter rule must still be able to authenticate to rotate it.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword: string;

  // Same length floor as register. Strength (zxcvbn ≥ 3), breach corpus
  // (HIBP), and reuse (SAME_PASSWORD) are enforced by AuthService — kept in
  // one place so we can't drift out of sync with the register flow.
  @ApiProperty({ description: 'Minimum 12 characters', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'newPassword must be at least 12 characters' })
  newPassword: string;

  @ApiPropertyOptional({
    description:
      'Optional device label — stamped on the fresh session issued after the password change.',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
