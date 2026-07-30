import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  preferredStoreId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsOptional()
  alternativeStoreIds?: string[];

  @ApiPropertyOptional()
  @IsNumber() @IsPositive() @IsOptional()
  lastPrice?: number;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  notes?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
