import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetAccountSyncEnabledDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
