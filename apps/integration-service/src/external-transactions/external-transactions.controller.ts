import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { ExternalTransactionsService } from './external-transactions.service';
import { MapTransactionDto } from './dto/map-transaction.dto';
import { UnmappedTransactionResponseDto } from './dto/unmapped-transaction-response.dto';

@ApiTags('Monobank')
@ApiHeader({ name: 'x-household-id', required: true })
@Controller('monobank')
export class ExternalTransactionsController {
  constructor(private readonly svc: ExternalTransactionsService) {}

  @Get('transactions')
  async findUnmapped(
    @Headers('x-household-id') hid: string,
    @Query('connectionId') connectionId?: string,
  ) {
    this.require(hid);
    const rows = await this.svc.findUnmapped(hid, connectionId);
    return rows.map(UnmappedTransactionResponseDto.from);
  }

  @Post('transactions/:id/map')
  async map(
    @Headers('x-user-id') userId: string,
    @Headers('x-household-id') hid: string,
    @Param('id') id: string,
    @Body() dto: MapTransactionDto,
  ) {
    this.require(hid);
    if (!userId) throw new UnauthorizedException('Missing X-User-Id');
    const tx = await this.svc.map(id, hid, userId, dto);
    return UnmappedTransactionResponseDto.from(tx);
  }

  private require(hid: string | undefined): asserts hid is string {
    if (!hid) throw new UnauthorizedException('Missing X-Household-Id');
  }
}
