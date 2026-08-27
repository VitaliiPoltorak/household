import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Transaction,
  TransactionType,
  TransferDirection,
} from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({
    enum: [
      TransactionType.INCOME,
      TransactionType.EXPENSE,
      TransactionType.ADJUSTMENT,
    ],
  })
  @IsEnum([
    TransactionType.INCOME,
    TransactionType.EXPENSE,
    TransactionType.ADJUSTMENT,
  ])
  type: Exclude<TransactionType, TransactionType.TRANSFER>;

  @ApiProperty({ example: 1500.0 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'UAH', default: 'UAH' })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  incomeSourceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-07-30' })
  @IsDateString()
  date: string;

  // Set by an integration (e.g. integration-service mapping a Monobank
  // transaction, #21) so a retried map call is idempotent instead of
  // double-booking the same bank transaction. Namespaced by the caller
  // (e.g. "monobank:<id>") since this column is shared across integrations.
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  externalId?: string;
}

/**
 * Cross-currency transfers (#162) — the two legs may carry different amounts
 * AND different currencies. The service resolves the payload as follows:
 *
 *   1. If `fromAmount` + `toAmount` are both present → use them per-leg.
 *      `currency`     → source-leg currency (default 'UAH')
 *      `toCurrency`   → destination-leg currency (default = source `currency`)
 *   2. Else if legacy `amount` is present → same-currency behaviour: both
 *      legs use `amount` and `currency`. `toCurrency` is ignored.
 *   3. Else the service throws 400.
 *
 * The legacy single-`amount` shape is kept because pre-#162 integrations,
 * mobile clients, and the existing test suite all rely on it.
 */
export class CreateTransferDto {
  @ApiProperty({ description: 'Source account id' })
  @IsString()
  @IsNotEmpty()
  fromAccountId: string;

  @ApiProperty({ description: 'Destination account id' })
  @IsString()
  @IsNotEmpty()
  toAccountId: string;

  /**
   * Legacy same-currency shortcut. When present without `fromAmount` /
   * `toAmount`, both legs are booked at this amount in `currency`.
   */
  @ApiPropertyOptional({
    example: 500.0,
    description: 'Legacy — same-currency amount for both legs.',
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  /** Amount debited from the source account, denominated in `currency`. */
  @ApiPropertyOptional({
    example: 1000.0,
    description: 'Amount debited from the source account (in source currency).',
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  fromAmount?: number;

  /** Amount credited to the destination account, denominated in `toCurrency`. */
  @ApiPropertyOptional({
    example: 24.2,
    description:
      'Amount credited to the destination account (in destination currency).',
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  toAmount?: number;

  @ApiPropertyOptional({
    example: 'UAH',
    description: 'Source currency (defaults to UAH).',
  })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Destination currency. Omit for same-currency transfers.',
  })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  toCurrency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-07-30' })
  @IsDateString()
  date: string;
}

/**
 * Wire shape returned by `GET /transactions` list.
 *
 * Mirrors the {@link Transaction} entity but adds a transfer-only sidecar so
 * that the frontend can render each transfer pair as ONE row instead of two
 * orphan-able legs (see #167). Non-transfer rows leave all `counter*` fields
 * null.
 *
 * The row surfaces the DEBIT leg by default (i.e. `accountId` = source
 * account, `counterAccountId` = destination). When the caller filtered by
 * an account and only the CREDIT leg matched, the row is "flipped" so
 * `accountId` = the matched account and `counterAccountId` = the other
 * side — this keeps "filter by account A" showing A in the primary column
 * whether A is the source or destination.
 */
export class TransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() householdId: string;
  @ApiProperty() accountId: string;
  @ApiProperty({ enum: TransactionType }) type: TransactionType;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty({ nullable: true }) categoryId: string | null;
  @ApiProperty({ nullable: true }) incomeSourceId: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() date: string;
  @ApiProperty() createdBy: string;
  @ApiProperty({ nullable: true }) transferPairId: string | null;
  @ApiProperty({ enum: TransferDirection, nullable: true })
  transferDirection: TransferDirection | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  /** Present only for transfer rows — the OTHER account (the counterparty). */
  @ApiPropertyOptional({ nullable: true })
  counterAccountId: string | null;

  /** Present only for transfer rows — the id of the paired leg. */
  @ApiPropertyOptional({ nullable: true })
  counterTransactionId: string | null;

  /** Present only for transfer rows — the counterparty leg's amount. Equal
   *  to `amount` for same-currency transfers; differs for cross-currency
   *  transfers (#162) where each leg carries its own currency amount. */
  @ApiPropertyOptional({ nullable: true })
  counterAmount: number | null;

  /** Present only for transfer rows — currency of the counterparty leg.
   *  Equal to `currency` for same-currency transfers; differs for
   *  cross-currency transfers (#162). */
  @ApiPropertyOptional({ nullable: true })
  counterCurrency: string | null;

  static fromEntity(
    tx: Transaction,
    counter: Transaction | null = null,
  ): TransactionResponseDto {
    return {
      id: tx.id,
      householdId: tx.householdId,
      accountId: tx.accountId,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      categoryId: tx.categoryId,
      incomeSourceId: tx.incomeSourceId,
      description: tx.description,
      date: tx.date,
      createdBy: tx.createdBy,
      transferPairId: tx.transferPairId,
      transferDirection: tx.transferDirection,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      counterAccountId: counter?.accountId ?? null,
      counterTransactionId: counter?.id ?? null,
      counterAmount: counter ? Number(counter.amount) : null,
      counterCurrency: counter?.currency ?? null,
    };
  }
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({
    enum: [
      TransactionType.INCOME,
      TransactionType.EXPENSE,
      TransactionType.ADJUSTMENT,
    ],
  })
  @IsEnum([
    TransactionType.INCOME,
    TransactionType.EXPENSE,
    TransactionType.ADJUSTMENT,
  ])
  @IsOptional()
  type?: Exclude<TransactionType, TransactionType.TRANSFER>;

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  incomeSourceId?: string;
}
