import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import {
  NetWorthSnapshot,
  NetWorthSnapshotSource,
} from '../entities/net-worth-snapshot.entity';

export class CreateNetWorthSnapshotDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  date: string;

  // Values (currency-shaped keys, finite numeric amounts) are validated in
  // the service — class-validator has no clean way to validate a Record's
  // values by type.
  @ApiProperty({ example: { UAH: 45000, USD: 1200 } })
  @IsObject()
  byCurrency: Record<string, number>;
}

/** POST .../snapshots/bulk — importing a year of pre-app history in one
 *  round trip instead of 12 (#379). */
export class BulkCreateNetWorthSnapshotDto {
  @ApiProperty({ type: [CreateNetWorthSnapshotDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateNetWorthSnapshotDto)
  snapshots: CreateNetWorthSnapshotDto[];
}

export class NetWorthSnapshotResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() householdId: string;
  @ApiProperty() snapshotDate: string;
  @ApiProperty() byCurrency: Record<string, number>;
  @ApiProperty({ enum: NetWorthSnapshotSource }) source: NetWorthSnapshotSource;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static fromEntity(s: NetWorthSnapshot): NetWorthSnapshotResponseDto {
    return {
      id: s.id,
      householdId: s.householdId,
      snapshotDate: s.snapshotDate,
      byCurrency: s.byCurrency,
      source: s.source,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
