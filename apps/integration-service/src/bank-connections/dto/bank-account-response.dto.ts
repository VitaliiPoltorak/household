import { ApiProperty } from '@nestjs/swagger';
import { BankAccount, BankAccountKind } from '../entities/bank-account.entity';

export class BankAccountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BankAccountKind }) kind: BankAccountKind;
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'e.g. "444455******1234"',
  })
  maskedPan: string | null;
  @ApiProperty({ required: false, nullable: true, description: 'Jar name' })
  title: string | null;
  @ApiProperty({ required: false, nullable: true }) currencyCode: number | null;
  @ApiProperty() syncEnabled: boolean;
  @ApiProperty({ required: false, nullable: true }) lastSyncAt: Date | null;
  @ApiProperty({ required: false, nullable: true }) lastError: string | null;

  static from(account: BankAccount): BankAccountResponseDto {
    return {
      id: account.id,
      kind: account.kind,
      maskedPan: account.maskedPan,
      title: account.title,
      currencyCode: account.currencyCode,
      syncEnabled: account.syncEnabled,
      lastSyncAt: account.lastSyncAt,
      lastError: account.lastError,
    };
  }
}
