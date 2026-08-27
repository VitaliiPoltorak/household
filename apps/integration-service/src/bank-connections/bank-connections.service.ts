import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  decryptSecret,
  encryptSecret,
  requireStrongEncryptionKey,
} from '@household/common';
import { LIST_HARD_LIMIT } from '@household/contracts';
import {
  BankConnection,
  BankConnectionStatus,
  BankProvider,
} from './entities/bank-connection.entity';
import { BankSyncLog } from './entities/bank-sync-log.entity';
import { ConnectMonobankDto } from './dto/connect-monobank.dto';
import { MonobankClientService } from '../monobank/monobank-client.service';

@Injectable()
export class BankConnectionsService {
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(BankConnection)
    private readonly repo: Repository<BankConnection>,
    @InjectRepository(BankSyncLog)
    private readonly syncLogRepo: Repository<BankSyncLog>,
    private readonly monobank: MonobankClientService,
    config: ConfigService,
  ) {
    this.encryptionKey = requireStrongEncryptionKey(config);
  }

  async connect(
    householdId: string,
    dto: ConnectMonobankDto,
  ): Promise<BankConnection> {
    // Throws UnauthorizedException/BadGatewayException on an invalid token or
    // an unreachable Monobank — never persist a connection we can't use.
    const clientInfo = await this.monobank.getClientInfo(dto.token);

    return this.repo.save(
      this.repo.create({
        householdId,
        provider: BankProvider.MONOBANK,
        tokenEncrypted: encryptSecret(dto.token, this.encryptionKey),
        monobankClientId: clientInfo.clientId,
        monobankAccountId: clientInfo.accounts[0]?.id ?? null,
        accountMappings: {},
        lastSyncAt: null,
        status: BankConnectionStatus.ACTIVE,
      }),
    );
  }

  findAll(householdId: string): Promise<BankConnection[]> {
    return this.repo.find({
      where: { householdId },
      order: { createdAt: 'DESC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async findOne(id: string, householdId: string): Promise<BankConnection> {
    const connection = await this.repo.findOne({ where: { id, householdId } });
    if (!connection) throw new NotFoundException('Bank connection not found');
    return connection;
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    // bank_sync_logs and external_transactions cascade via ON DELETE CASCADE.
    await this.repo.delete(id);
  }

  async getLogs(id: string, householdId: string): Promise<BankSyncLog[]> {
    await this.findOne(id, householdId);
    return this.syncLogRepo.find({
      where: { connectionId: id },
      order: { startedAt: 'DESC' },
      take: LIST_HARD_LIMIT,
    });
  }

  decryptToken(connection: BankConnection): string {
    return decryptSecret(connection.tokenEncrypted, this.encryptionKey);
  }
}
