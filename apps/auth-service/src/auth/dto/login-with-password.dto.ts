import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginWithPasswordDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  // Only length is enforced on login — the strong-password rule lives on
  // register. A user whose password predates a stricter rule must still be
  // able to log in and rotate it.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
