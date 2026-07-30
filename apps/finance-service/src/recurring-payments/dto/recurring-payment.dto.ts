import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaymentFrequency } from '../entities/recurring-payment.entity';

export class CreateRecurringPaymentDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsNumber() @IsPositive()
  amount: number;

  @ApiPropertyOptional({ default: 'UAH' })
  @IsString() @IsOptional() @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  categoryId?: string;

  @ApiProperty({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  frequency: PaymentFrequency;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  nextDueDate: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  accountId?: string;
}

export class UpdateRecurringPaymentDto extends PartialType(CreateRecurringPaymentDto) {}
