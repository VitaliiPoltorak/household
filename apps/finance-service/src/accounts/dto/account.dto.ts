import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateAccountDto {
  @ApiProperty({ example: 'Mono Card' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // Validated against the household's enabled account types at the service
  // layer (AccountTypesService.assertEnabled) rather than a fixed enum —
  // households can enable/create their own types (#227).
  @ApiProperty({ example: 'bank' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 40)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  type: string;

  @ApiPropertyOptional({ example: 'UAH', default: 'UAH' })
  @IsString()
  @IsOptional()
  @Length(2, 10)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional()
  @IsOptional()
  isArchived?: boolean;
}

export class AdjustBalanceDto {
  @ApiProperty({
    example: 11000.0,
    description: 'The new balance after manual adjustment',
  })
  @IsNumber()
  newBalance: number;

  @ApiPropertyOptional({ example: 'Cash count correction' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsDateString()
  @IsOptional()
  date?: string;
}
