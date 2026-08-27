import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { LIST_HARD_LIMIT } from '@household/contracts';
import { ExternalTransaction } from './entities/external-transaction.entity';
import { BankConnectionsService } from '../bank-connections/bank-connections.service';
import { MapTransactionDto } from './dto/map-transaction.dto';
import { FinanceClientService } from './finance-client.service';
import { numericCurrencyToAlpha3 } from './currency-code';
import type { MonobankStatementItem } from '../monobank/monobank-client.service';

@Injectable()
export class ExternalTransactionsService {
  constructor(
    @InjectRepository(ExternalTransaction)
    private readonly repo: Repository<ExternalTransaction>,
    private readonly connections: BankConnectionsService,
    private readonly financeClient: FinanceClientService,
  ) {}

  async findUnmapped(
    householdId: string,
    connectionId?: string,
  ): Promise<ExternalTransaction[]> {
    let connectionIds: string[];
    if (connectionId) {
      // Also asserts the connection belongs to this household (404 otherwise).
      await this.connections.findOne(connectionId, householdId);
      connectionIds = [connectionId];
    } else {
      connectionIds = (await this.connections.findAll(householdId)).map(
        (c) => c.id,
      );
    }
    if (connectionIds.length === 0) return [];

    return this.repo.find({
      where: { connectionId: In(connectionIds), mappedTransactionId: IsNull() },
      order: { createdAt: 'DESC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async map(
    id: string,
    householdId: string,
    userId: string,
    dto: MapTransactionDto,
  ): Promise<ExternalTransaction> {
    const tx = await this.repo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('External transaction not found');
    // Asserts the owning connection belongs to this household (404 otherwise).
    await this.connections.findOne(tx.connectionId, householdId);
    if (tx.mappedTransactionId) {
      throw new ConflictException('This transaction is already mapped');
    }

    const item = tx.rawData as unknown as MonobankStatementItem;
    const currency = numericCurrencyToAlpha3(item.currencyCode);
    if (!currency) {
      throw new BadRequestException(
        `Unsupported currency code ${item.currencyCode}`,
      );
    }

    const created = await this.financeClient.createTransaction(
      { userId, householdId },
      {
        accountId: dto.accountId,
        type: item.amount >= 0 ? 'income' : 'expense',
        amount: Math.abs(item.amount) / 100,
        currency,
        categoryId: dto.categoryId,
        description: item.description,
        date: new Date(item.time * 1000).toISOString(),
        externalId: `monobank:${tx.externalId}`,
      },
    );

    tx.mappedTransactionId = created.id;
    return this.repo.save(tx);
  }
}
