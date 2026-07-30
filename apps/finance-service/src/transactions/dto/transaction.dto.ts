import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  accountId: string;

  @ApiProperty({ enum: [TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.ADJUSTMENT] })
  @IsEnum([TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.ADJUSTMENT])
  type: Exclude<TransactionType, TransactionType.TRANSFER>;

  @ApiProperty({ example: 1500.00 })
  @IsNumber() @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'UAH', default: 'UAH' })
  @IsString() @IsOptional() @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  incomeSourceId?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-07-30' })
  @IsDateString()
  date: string;
}

export class CreateTransferDto {
  @ApiProperty({ description: 'Source account id' })
  @IsString() @IsNotEmpty()
  fromAccountId: string;

  @ApiProperty({ description: 'Destination account id' })
  @IsString() @IsNotEmpty()
  toAccountId: string;

  @ApiProperty({ example: 500.00 })
  @IsNumber() @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'UAH' })
  @IsString() @IsOptional() @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-07-30' })
  @IsDateString()
  date: string;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional()
  @IsString() @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  incomeSourceId?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsDateString() @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsNumber() @IsPositive() @IsOptional()
  amount?: number;
}
