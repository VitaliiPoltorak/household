import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ListStatus } from '../entities/shopping-list.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateShoppingListDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  storeId?: string;
}

export class UpdateShoppingListDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  storeId?: string;

  @ApiPropertyOptional({ enum: ListStatus })
  @IsEnum(ListStatus)
  @IsOptional()
  status?: ListStatus;
}

export class CreateItemDto {
  @ApiProperty()
  @IsString()
  @Transform(trim)
  @MinLength(3)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  preferredStoreId?: string;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  actualStoreId?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPurchased?: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  price?: number;
}
