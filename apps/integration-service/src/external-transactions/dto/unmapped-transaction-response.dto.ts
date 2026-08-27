import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExternalTransaction } from '../entities/external-transaction.entity';
import type { MonobankStatementItem } from '../../monobank/monobank-client.service';
import { numericCurrencyToAlpha3 } from '../currency-code';
import { suggestCategoryName } from '../mcc-category';

export class UnmappedTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() connectionId: string;
  @ApiProperty() externalId: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() mcc: number;
  @ApiProperty({
    description: 'Signed amount in major currency units (negative = expense)',
  })
  amount: number;
  @ApiProperty({
    nullable: true,
    description: 'ISO 4217 alpha-3, null if the numeric code is unmapped',
  })
  currency: string | null;
  @ApiProperty({ description: 'ISO 8601 timestamp' }) date: string;
  @ApiPropertyOptional({ nullable: true }) suggestedCategoryName: string | null;
  @ApiProperty({ nullable: true }) mappedTransactionId: string | null;
  @ApiProperty() createdAt: Date;

  static from(tx: ExternalTransaction): UnmappedTransactionResponseDto {
    const item = tx.rawData as unknown as MonobankStatementItem;
    return {
      id: tx.id,
      connectionId: tx.connectionId,
      externalId: tx.externalId,
      description: item.description ?? null,
      mcc: item.mcc,
      amount: item.amount / 100,
      currency: numericCurrencyToAlpha3(item.currencyCode),
      date: new Date(item.time * 1000).toISOString(),
      suggestedCategoryName: suggestCategoryName(item.mcc),
      mappedTransactionId: tx.mappedTransactionId,
      createdAt: tx.createdAt,
    };
  }
}
