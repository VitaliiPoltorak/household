import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateAccountDto {
  @ApiProperty({ example: 'Mono Card' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // Validated against the household's enabled account types at the service
  // layer (AccountTypesService.assertEnabled) rather than a fixed enum —
  // households can enable/create their own types (#227).
  @ApiProperty({ example: 'bank' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 40)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  type: string;

  @ApiPropertyOptional({ example: 'UAH', default: 'UAH' })
  @IsString()
  @IsOptional()
  @Length(2, 10)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  // Opt-in overdraft (#326). Defaults to false at the column, so omitting it
  // gets the strict behaviour — a credit card or a bank account with an
  // arranged overdraft is the case that has to say so explicitly.
  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'Allow this account to go below zero. When false, a withdrawal that would overdraw it is rejected with INSUFFICIENT_FUNDS.',
  })
  @IsBoolean()
  @IsOptional()
  allowsNegativeBalance?: boolean;

  // What the account already holds when it is added (#326). Without this an
  // account necessarily starts at 0, and the withdrawal guard would refuse
  // the user's very first expense on it — you would have to create the
  // account and then immediately correct its balance before it was usable.
  //
  // Deliberately NOT validated as non-negative: a credit card being added
  // while already 500 in the red is a statement of fact, and the same
  // reasoning that exempts manual adjustments from the guard applies here.
  // This sets the starting balance directly and books no transaction — an
  // opening balance is the account's initial state, not something that
  // happened to it, and counting it as income would corrupt every report.
  @ApiPropertyOptional({
    example: 1500.0,
    default: 0,
    description:
      'Balance the account already holds when created. Sets the starting balance directly; no transaction is recorded.',
  })
  @IsNumber()
  @IsOptional()
  initialBalance?: number;
}

// initialBalance is omitted on purpose: it describes the account's state at
// creation and has no meaning afterwards. Leaving it in would accept a field
// that silently does nothing (update() assigns onto a non-column property),
// which reads as "changing the opening balance" and is not that. Correcting a
// balance later is POST /accounts/:id/adjust-balance, which books the
// ADJUSTMENT transaction that keeps the ledger and the balance in agreement.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['initialBalance'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  isArchived?: boolean;
}

export class AdjustBalanceDto {
  @ApiProperty({
    example: 11000.0,
    description: 'The new balance after manual adjustment',
  })
  @IsNumber()
  newBalance: number;

  @ApiPropertyOptional({ example: 'Cash count correction' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsDateString()
  @IsOptional()
  date?: string;
}
