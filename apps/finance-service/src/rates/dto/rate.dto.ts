import { ApiProperty } from '@nestjs/swagger';

export class RateDto {
  @ApiProperty({ example: 'USD' })
  ccy: string;

  @ApiProperty({ example: 'UAH' })
  base_ccy: string;

  @ApiProperty({ example: '41.150000' })
  buy: string;

  @ApiProperty({ example: '42.050000' })
  sale: string;

  @ApiProperty({ example: '2026-08-06' })
  effective_date: string;

  @ApiProperty({ example: 'privatbank' })
  source: string;
}
