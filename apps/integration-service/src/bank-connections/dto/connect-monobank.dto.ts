import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectMonobankDto {
  @ApiProperty({
    description: 'Monobank personal API token (from api.monobank.ua)',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
