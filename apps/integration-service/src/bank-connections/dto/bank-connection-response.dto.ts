import { ApiProperty } from '@nestjs/swagger';
import {
  BankConnection,
  BankConnectionStatus,
  BankProvider,
} from '../entities/bank-connection.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { BankAccountResponseDto } from './bank-account-response.dto';

// Explicit response shape — tokenEncrypted must never reach a client.
// Mapped by hand rather than relying on class-transformer's @Exclude, which
// nothing in this codebase wires up via a global ClassSerializerInterceptor.
export class BankConnectionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BankProvider }) provider: BankProvider;
  @ApiProperty({ required: false, nullable: true }) monobankClientId:
    | string
    | null;
  // Per-account display (masked PAN, sync status) now lives on each entry
  // of `accounts` — a connection can hold several accounts/jars (#293).
  @ApiProperty({ type: [BankAccountResponseDto] })
  accounts: BankAccountResponseDto[];
  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Last statement API call on this token, across all its accounts',
  })
  lastSyncAt: Date | null;
  @ApiProperty({ enum: BankConnectionStatus }) status: BankConnectionStatus;
  @ApiProperty() createdAt: Date;

  static from(
    connection: BankConnection,
    accounts: BankAccount[],
  ): BankConnectionResponseDto {
    return {
      id: connection.id,
      provider: connection.provider,
      monobankClientId: connection.monobankClientId,
      accounts: accounts.map(BankAccountResponseDto.from),
      lastSyncAt: connection.lastSyncAt,
      status: connection.status,
      createdAt: connection.createdAt,
    };
  }
}
