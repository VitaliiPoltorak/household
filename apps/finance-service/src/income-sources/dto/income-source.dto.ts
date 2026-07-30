import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IncomeSourceType } from '../entities/income-source.entity';

export class CreateIncomeSourceDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: IncomeSourceType })
  @IsEnum(IncomeSourceType)
  type: IncomeSourceType;
}

export class UpdateIncomeSourceDto extends PartialType(CreateIncomeSourceDto) {}
