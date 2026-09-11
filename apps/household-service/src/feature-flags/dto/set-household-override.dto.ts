import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetHouseholdOverrideDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;
}
