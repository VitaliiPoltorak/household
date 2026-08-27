import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MapTransactionDto {
  @ApiProperty({
    description: 'finance-service account id to book this transaction against',
  })
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiPropertyOptional({ description: 'finance-service category id' })
  @IsString()
  @IsOptional()
  categoryId?: string;
}
