import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

// code is a slug: lowercase letters/digits/underscore/hyphen. Households can
// enable an existing catalog code, or coin a brand-new one — `label` is
// required in that case (see AccountTypesService.enable).
export class EnableAccountTypeDto {
  @ApiProperty({ example: 'paypal' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 40)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'code must be lowercase letters, digits, "_" or "-" only',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  code: string;

  @ApiPropertyOptional({
    example: 'PayPal',
    description: 'Required when `code` is not an existing catalog entry',
  })
  @IsString()
  @IsOptional()
  @Length(1, 60)
  label?: string;

  @ApiPropertyOptional({ example: '💳' })
  @IsString()
  @IsOptional()
  icon?: string;
}
