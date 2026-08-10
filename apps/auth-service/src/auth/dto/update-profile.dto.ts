import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  // Restrict to http(s) with an explicit scheme so a user can't submit
  // javascript:, data:, or file: URIs — those would be rendered as-is by any
  // <img src> and become an XSS/SSRF vector. Cap length to keep row size sane.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(5)
  locale?: string;
}
