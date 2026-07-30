import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHouseholdDto {
  @ApiProperty({ example: 'My Family' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
