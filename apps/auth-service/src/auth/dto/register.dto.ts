import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: 'Alice Example' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName: string;

  // Minimum length only. No character-class rule — those are counter-
  // recommended by NIST SP 800-63B §5.1.1.2 (2017) since they push users
  // toward predictable patterns like "P@ssw0rd1". Actual strength is
  // enforced downstream by PasswordComplexityService (zxcvbn ≥ 3) and
  // HibpService (breach corpus check). See docs/security/password-policy.md.
  @ApiProperty({ description: 'Minimum 12 characters', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters' })
  password: string;

  @ApiPropertyOptional({ description: 'Optional device label (kept in session record)' })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
