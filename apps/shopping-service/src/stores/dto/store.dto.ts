import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { StoreType } from '../entities/store.entity';

export class CreateStoreDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ enum: StoreType, default: StoreType.OTHER })
  @IsEnum(StoreType) @IsOptional()
  type?: StoreType;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  address?: string;
}

export class UpdateStoreDto extends PartialType(CreateStoreDto) {}
