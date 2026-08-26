import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LIST_HARD_LIMIT } from '@household/contracts';
import { AccountTypeCatalog } from './entities/account-type-catalog.entity';
import { HouseholdAccountType } from './entities/household-account-type.entity';
import { EnableAccountTypeDto } from './dto/account-type.dto';
import { Account } from '../accounts/entities/account.entity';

// The 5 types the old native Postgres enum offered — seeded as is_system=true
// so the UI can prevent deleting/renaming them. Households can additionally
// coin genuinely new codes (is_system=false) — see enable() below.
const SYSTEM_TYPES: Omit<AccountTypeCatalog, 'createdAt'>[] = [
  { code: 'cash', label: 'Cash', icon: null, isSystem: true },
  { code: 'bank', label: 'Bank', icon: null, isSystem: true },
  { code: 'crypto', label: 'Crypto', icon: null, isSystem: true },
  { code: 'investment', label: 'Investment', icon: null, isSystem: true },
  { code: 'deposit', label: 'Deposit', icon: null, isSystem: true },
];

const DEFAULT_ENABLED_CODES = SYSTEM_TYPES.map((t) => t.code);

export interface AccountTypeImpact {
  code: string;
  accounts: number;
}

@Injectable()
export class AccountTypesService {
  private readonly logger = new Logger(AccountTypesService.name);

  constructor(
    @InjectRepository(AccountTypeCatalog)
    private readonly catalogRepo: Repository<AccountTypeCatalog>,
    @InjectRepository(HouseholdAccountType)
    private readonly enabledRepo: Repository<HouseholdAccountType>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  // Deliberately NOT run from onModuleInit — see CurrenciesService for why
  // (test harness creates the schema after app.init(), so an eager boot-seed
  // 500s every test app). Called defensively from every read/write path
  // below instead; cheap on a 5-row table, and self-healing after
  // integration tests truncate it via cleanDatabase() between cases.
  private async ensureCatalog(): Promise<void> {
    await this.catalogRepo
      .createQueryBuilder()
      .insert()
      .into(AccountTypeCatalog)
      .values(SYSTEM_TYPES)
      .orIgnore()
      .execute();
  }

  /** Enables the default set for a brand-new household (#227). Idempotent — safe for at-least-once Kafka delivery. */
  async seedDefaults(householdId: string): Promise<void> {
    await this.enabledRepo
      .createQueryBuilder()
      .insert()
      .into(HouseholdAccountType)
      .values(
        DEFAULT_ENABLED_CODES.map((typeCode) => ({ householdId, typeCode })),
      )
      .orIgnore()
      .execute();
    this.logger.log(`Seeded default account types for household`);
  }

  async findAll(): Promise<AccountTypeCatalog[]> {
    await this.ensureCatalog();
    return this.catalogRepo.find({
      order: { code: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async findEnabled(householdId: string): Promise<HouseholdAccountType[]> {
    await this.ensureSeeded(householdId);
    return this.enabledRepo.find({
      where: { householdId },
      relations: { accountType: true },
      order: { typeCode: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }

  /**
   * Enables `dto.code` for the household. If the code already exists in the
   * global catalog, that entry is reused (matches #226's currency behavior —
   * a code is a shared identity across households). If it doesn't exist,
   * this household is coining a brand-new custom type: `dto.label` is
   * required in that case, and the new catalog row is is_system=false.
   */
  async enable(
    householdId: string,
    dto: EnableAccountTypeDto,
  ): Promise<HouseholdAccountType> {
    await this.ensureCatalog();
    let catalogEntry = await this.catalogRepo.findOne({
      where: { code: dto.code },
    });
    if (!catalogEntry) {
      if (!dto.label) {
        throw new BadRequestException(
          `"${dto.code}" is not an existing account type — provide "label" to create a new one`,
        );
      }
      catalogEntry = await this.catalogRepo.save(
        this.catalogRepo.create({
          code: dto.code,
          label: dto.label,
          icon: dto.icon ?? null,
          isSystem: false,
        }),
      );
    }

    const existing = await this.enabledRepo.findOne({
      where: { householdId, typeCode: catalogEntry.code },
    });
    if (existing) return existing;
    return this.enabledRepo.save(
      this.enabledRepo.create({ householdId, typeCode: catalogEntry.code }),
    );
  }

  async getImpact(
    householdId: string,
    code: string,
  ): Promise<AccountTypeImpact> {
    const accounts = await this.accountRepo.count({
      where: { householdId, type: code, isArchived: false },
    });
    return { code, accounts };
  }

  async disable(householdId: string, code: string): Promise<void> {
    const impact = await this.getImpact(householdId, code);
    if (impact.accounts > 0) {
      throw new ConflictException({
        message: 'Cannot disable an account type with active accounts using it',
        impact,
      });
    }
    await this.enabledRepo.delete({ householdId, typeCode: code });
  }

  /** Service-layer "FK" check (#227) — see PR notes on why this isn't a DB-level FK. */
  async assertEnabled(householdId: string, code: string): Promise<void> {
    await this.ensureSeeded(householdId);
    const enabled = await this.enabledRepo.findOne({
      where: { householdId, typeCode: code },
    });
    if (!enabled) {
      throw new BadRequestException(
        `Account type "${code}" is not enabled for this household`,
      );
    }
  }

  // Self-healing fallback for the household.created Kafka delivery race, and
  // the seeding path in tests (KafkaConsumerService.subscribe() is mocked).
  private async ensureSeeded(householdId: string): Promise<void> {
    await this.ensureCatalog();
    const hasAny = await this.enabledRepo.exists({ where: { householdId } });
    if (!hasAny) {
      await this.seedDefaults(householdId);
    }
  }
}
