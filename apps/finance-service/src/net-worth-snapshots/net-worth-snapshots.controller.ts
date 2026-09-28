import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { NetWorthSnapshotsService } from './net-worth-snapshots.service';
import {
  CreateNetWorthSnapshotDto,
  BulkCreateNetWorthSnapshotDto,
  NetWorthSnapshotResponseDto,
} from './dto/net-worth-snapshot.dto';

@ApiTags('Reports')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('reports/net-worth/snapshots')
export class NetWorthSnapshotsController {
  constructor(private readonly svc: NetWorthSnapshotsService) {}

  @Get()
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  async list(
    @Headers('x-household-id') hid: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<NetWorthSnapshotResponseDto[]> {
    this.require(hid);
    const rows = await this.svc.list(hid, from, to);
    return rows.map(NetWorthSnapshotResponseDto.fromEntity);
  }

  @Post()
  async create(
    @Headers('x-household-id') hid: string,
    @Body() dto: CreateNetWorthSnapshotDto,
  ): Promise<NetWorthSnapshotResponseDto> {
    this.require(hid);
    const row = await this.svc.createManual(hid, dto.date, dto.byCurrency);
    return NetWorthSnapshotResponseDto.fromEntity(row);
  }

  @Post('bulk')
  async createBulk(
    @Headers('x-household-id') hid: string,
    @Body() dto: BulkCreateNetWorthSnapshotDto,
  ): Promise<{ count: number }> {
    this.require(hid);
    await this.svc.createManyManual(hid, dto.snapshots);
    return { count: dto.snapshots.length };
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
