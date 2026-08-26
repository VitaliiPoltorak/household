import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  IsUrl,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @Transform(trim)
  @MinLength(3)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  preferredStoreId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  alternativeStoreIds?: string[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  lastPrice?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description:
      "Link to the product on a store's website — preview image/title are fetched server-side",
  })
  @IsUrl()
  @IsOptional()
  url?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
