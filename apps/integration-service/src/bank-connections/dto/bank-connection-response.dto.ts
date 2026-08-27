import { ApiProperty } from '@nestjs/swagger';
import {
  BankConnection,
  BankConnectionStatus,
  BankProvider,
} from '../entities/bank-connection.entity';

// Explicit response shape — tokenEncrypted must never reach a client.
// Mapped by hand rather than relying on class-transformer's @Exclude, which
// nothing in this codebase wires up via a global ClassSerializerInterceptor.
export class BankConnectionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BankProvider }) provider: BankProvider;
  @ApiProperty({ required: false, nullable: true }) monobankClientId:
    | string
    | null;
  @ApiProperty({ required: false, nullable: true }) monobankAccountId:
    | string
    | null;
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'e.g. "444455******1234"',
  })
  maskedPan: string | null;
  @ApiProperty({ required: false, nullable: true }) lastSyncAt: Date | null;
  @ApiProperty({ enum: BankConnectionStatus }) status: BankConnectionStatus;
  @ApiProperty() createdAt: Date;

  static from(connection: BankConnection): BankConnectionResponseDto {
    return {
      id: connection.id,
      provider: connection.provider,
      monobankClientId: connection.monobankClientId,
      monobankAccountId: connection.monobankAccountId,
      maskedPan: connection.maskedPan,
      lastSyncAt: connection.lastSyncAt,
      status: connection.status,
      createdAt: connection.createdAt,
    };
  }
}
