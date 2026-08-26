import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LIST_HARD_LIMIT } from '@household/contracts';
import { Currency } from './entities/currency.entity';
import { HouseholdCurrency } from './entities/household-currency.entity';
import { Account } from '../accounts/entities/account.entity';

// Lazily seeded on first access (idempotent — `.orIgnore()`) and again
// per-household on `household.created` (#226). Matches the 3 currencies
// AccountsPage.tsx's hardcoded dropdown already offers, so no frontend
// change is needed for this pass — a household simply starts with all 3
// pre-enabled.
const GLOBAL_CATALOG: Omit<Currency, 'createdAt'>[] = [
  {
    code: 'UAH',
    name: 'Ukrainian Hryvnia',
    symbol: '₴',
    isCrypto: false,
    decimals: 2,
  },
  { code: 'USD', name: 'US Dollar', symbol: '$', isCrypto: false, decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', isCrypto: false, decimals: 2 },
];

const DEFAULT_ENABLED_CODES = ['UAH', 'USD', 'EUR'];

export interface CurrencyImpact {
  code: string;
  accounts: number;
}

@Injectable()
export class CurrenciesService {
  private readonly logger = new Logger(CurrenciesService.name);

  constructor(
    @InjectRepository(Currency)
    private readonly catalogRepo: Repository<Currency>,
    @InjectRepository(HouseholdCurrency)
    private readonly enabledRepo: Repository<HouseholdCurrency>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  // Idempotent (`.orIgnore()`) — deliberately NOT run from onModuleInit:
  // that hook fires during app.init(), before the test harness's
  // ensureSchema()/synchronize() call has created the table, so an eager
  // boot-seed would 500 every test app on startup. Called defensively from
  // every read/write path below instead — cheap on a 3-row table, and it
  // makes the catalog self-healing after integration tests truncate it via
  // cleanDatabase() between cases.
  private async ensureCatalog(): Promise<void> {
    await this.catalogRepo
      .createQueryBuilder()
      .insert()
      .into(Currency)
      .values(GLOBAL_CATALOG)
      .orIgnore()
      .execute();
  }

  /** Enables the default set for a brand-new household (#226). Idempotent — safe for at-least-once Kafka delivery. */
  async seedDefaults(householdId: string): Promise<void> {
    await this.enabledRepo
      .createQueryBuilder()
      .insert()
      .into(HouseholdCurrency)
      .values(
        DEFAULT_ENABLED_CODES.map((currencyCode) => ({
          householdId,
          currencyCode,
        })),
      )
      .orIgnore()
      .execute();
    this.logger.log(`Seeded default currencies for household`);
  }

  async findAll(): Promise<Currency[]> {
    await this.ensureCatalog();
    return this.catalogRepo.find({
      order: { code: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async findEnabled(householdId: string): Promise<HouseholdCurrency[]> {
    await this.ensureSeeded(householdId);
    return this.enabledRepo.find({
      where: { householdId },
      relations: { currency: true },
      order: { currencyCode: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async enable(householdId: string, code: string): Promise<HouseholdCurrency> {
    await this.ensureCatalog();
    const catalogEntry = await this.catalogRepo.findOne({ where: { code } });
    if (!catalogEntry) {
      throw new BadRequestException(`Unknown currency code "${code}"`);
    }
    const existing = await this.enabledRepo.findOne({
      where: { householdId, currencyCode: code },
    });
    if (existing) return existing;
    return this.enabledRepo.save(
      this.enabledRepo.create({ householdId, currencyCode: code }),
    );
  }

  async getImpact(householdId: string, code: string): Promise<CurrencyImpact> {
    const accounts = await this.accountRepo.count({
      where: { householdId, currency: code, isArchived: false },
    });
    return { code, accounts };
  }

  async disable(householdId: string, code: string): Promise<void> {
    const impact = await this.getImpact(householdId, code);
    if (impact.accounts > 0) {
      throw new ConflictException({
        message: 'Cannot disable a currency with active accounts using it',
        impact,
      });
    }
    await this.enabledRepo.delete({ householdId, currencyCode: code });
  }

  /** Service-layer "FK" check (#226) — see PR notes on why this isn't a DB-level FK. */
  async assertEnabled(householdId: string, code: string): Promise<void> {
    await this.ensureSeeded(householdId);
    const enabled = await this.enabledRepo.findOne({
      where: { householdId, currencyCode: code },
    });
    if (!enabled) {
      throw new BadRequestException(
        `Currency "${code}" is not enabled for this household`,
      );
    }
  }

  // Self-healing fallback for the household.created Kafka delivery race
  // (event may not have landed yet) — and the only seeding path in tests,
  // which mock KafkaConsumerService.subscribe() as a no-op. A household with
  // zero enabled currencies is indistinguishable from "not seeded yet", so
  // this is safe to call unconditionally; seedDefaults() is itself idempotent.
  private async ensureSeeded(householdId: string): Promise<void> {
    await this.ensureCatalog();
    const hasAny = await this.enabledRepo.exists({ where: { householdId } });
    if (!hasAny) {
      await this.seedDefaults(householdId);
    }
  }
}
