import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AccountType } from '../entities/account.entity';

export class CreateAccountDto {
  @ApiProperty({ example: 'Mono Card' })
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiPropertyOptional({ example: 'UAH', default: 'UAH' })
  @IsString() @IsOptional() @Length(3, 3)
  currency?: string;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional()
  @IsOptional()
  isArchived?: boolean;
}

export class AdjustBalanceDto {
  @ApiProperty({ example: 11000.00, description: 'The new balance after manual adjustment' })
  @IsNumber()
  newBalance: number;

  @ApiPropertyOptional({ example: 'Cash count correction' })
  @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsDateString() @IsOptional()
  date?: string;
}
