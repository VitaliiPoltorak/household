import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnlockAccountDto {
  @ApiProperty({
    description: 'Single-use unlock token from the account-locked email',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'token must be 64 hex characters' })
  token: string;
}
