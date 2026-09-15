import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { BankAccount, BankAccountKind } from './entities/bank-account.entity';
import { BankSyncLog } from './entities/bank-sync-log.entity';
import { ConnectMonobankDto } from './dto/connect-monobank.dto';
import {
  MonobankClientService,
  type MonobankClientInfo,
} from '../monobank/monobank-client.service';

@Injectable()
export class BankConnectionsService {
  private readonly encryptionKey: string;
  // Optional fallback for key rotation — set only while TOKEN_ENCRYPTION_KEY
  // is being rotated. See decryptToken().
  private readonly previousEncryptionKey?: string;

  constructor(
    @InjectRepository(BankConnection)
    private readonly repo: Repository<BankConnection>,
    @InjectRepository(BankAccount)
    private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(BankSyncLog)
    private readonly syncLogRepo: Repository<BankSyncLog>,
    private readonly monobank: MonobankClientService,
    config: ConfigService,
  ) {
    this.encryptionKey = requireStrongEncryptionKey(config);
    this.previousEncryptionKey = config.get<string>(
      'TOKEN_ENCRYPTION_KEY_PREV',
    );
  }

  async connect(
    householdId: string,
    dto: ConnectMonobankDto,
  ): Promise<BankConnection> {
    // Throws UnauthorizedException/BadGatewayException on an invalid token or
    // an unreachable Monobank — never persist a connection we can't use.
    const clientInfo = await this.monobank.getClientInfo(dto.token);

    const connection = await this.repo.save(
      this.repo.create({
        householdId,
        provider: BankProvider.MONOBANK,
        tokenEncrypted: encryptSecret(dto.token, this.encryptionKey),
        monobankClientId: clientInfo.clientId,
        lastSyncAt: null,
        status: BankConnectionStatus.ACTIVE,
      }),
    );

    await this.accountRepo.save(
      this.buildAccountRows(connection.id, clientInfo),
    );

    return connection;
  }

  // Every account syncs by default; jars don't (#293 decision — a jar adds
  // another 60s step to every sync run on the same token).
  private buildAccountRows(
    connectionId: string,
    clientInfo: MonobankClientInfo,
  ): BankAccount[] {
    const accounts = clientInfo.accounts.map((a) =>
      this.accountRepo.create({
        connectionId,
        monobankAccountId: a.id,
        kind: BankAccountKind.ACCOUNT,
        maskedPan: a.maskedPan[0] ?? null,
        iban: a.iban,
        currencyCode: a.currencyCode,
        syncEnabled: true,
        lastSyncAt: null,
      }),
    );
    const jars = (clientInfo.jars ?? []).map((j) =>
      this.accountRepo.create({
        connectionId,
        monobankAccountId: j.id,
        kind: BankAccountKind.JAR,
        title: j.title,
        currencyCode: j.currencyCode,
        syncEnabled: false,
        lastSyncAt: null,
      }),
    );
    return [...accounts, ...jars];
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

  // Scoped through the owning connection (never a bare accountRepo.find by
  // id) so a caller can't enumerate another household's accounts.
  async findAccounts(
    connectionId: string,
    householdId: string,
  ): Promise<BankAccount[]> {
    await this.findOne(connectionId, householdId);
    return this.accountRepo.find({
      where: { connectionId },
      order: { createdAt: 'ASC' },
    });
  }

  // Batched form for a connection list (findAll already scoped it to the
  // caller's household, so connectionIds here are trusted). Grouped by
  // connectionId so BankConnectionResponseDto.from() can attach each
  // connection's own accounts without an N+1 query.
  async findAccountsGrouped(
    connectionIds: string[],
  ): Promise<Map<string, BankAccount[]>> {
    const grouped = new Map<string, BankAccount[]>();
    if (connectionIds.length === 0) return grouped;

    const accounts = await this.accountRepo.find({
      where: { connectionId: In(connectionIds) },
      order: { createdAt: 'ASC' },
    });
    for (const account of accounts) {
      const existing = grouped.get(account.connectionId) ?? [];
      existing.push(account);
      grouped.set(account.connectionId, existing);
    }
    return grouped;
  }

  async setAccountSyncEnabled(
    connectionId: string,
    accountId: string,
    householdId: string,
    enabled: boolean,
  ): Promise<BankAccount> {
    await this.findOne(connectionId, householdId);
    const account = await this.accountRepo.findOne({
      where: { id: accountId, connectionId },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    account.syncEnabled = enabled;
    return this.accountRepo.save(account);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    // bank_accounts, bank_sync_logs and external_transactions all cascade
    // via ON DELETE CASCADE.
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
    return decryptSecret(
      connection.tokenEncrypted,
      this.encryptionKey,
      this.previousEncryptionKey,
    );
  }
}
