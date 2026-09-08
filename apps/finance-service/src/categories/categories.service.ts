import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { LIST_HARD_LIMIT } from '@household/contracts';
import { Category, CategoryType } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecurringPayment } from '../recurring-payments/entities/recurring-payment.entity';

const UNIQUE_VIOLATION = '23505';

/**
 * Seeded into every new household (#325) so categorisation works out of the
 * box — before this, a fresh household had no categories, no way to create
 * one, and the transaction dialogs hid the category field precisely because
 * the list was empty.
 *
 * English-only, deliberately: `household.created` carries only a householdId
 * (see HouseholdEventsConsumer), so the creator's locale is not knowable at
 * seed time. Renaming is a one-click edit on the Categories screen, which is
 * a better answer than guessing wrong. Localising these would mean putting a
 * locale on the event, which is a change to household-service's contract.
 *
 * Kept short on purpose. A starter set is meant to be pruned and extended, and
 * a wall of thirty categories is more work to clean up than to build.
 */
const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  type: CategoryType;
  icon: string;
}> = [
  { name: 'Groceries', type: CategoryType.EXPENSE, icon: '🛒' },
  { name: 'Eating out', type: CategoryType.EXPENSE, icon: '🍽️' },
  { name: 'Transport', type: CategoryType.EXPENSE, icon: '🚌' },
  { name: 'Housing', type: CategoryType.EXPENSE, icon: '🏠' },
  { name: 'Utilities', type: CategoryType.EXPENSE, icon: '💡' },
  { name: 'Health', type: CategoryType.EXPENSE, icon: '💊' },
  { name: 'Entertainment', type: CategoryType.EXPENSE, icon: '🎬' },
  { name: 'Other', type: CategoryType.EXPENSE, icon: '📦' },
  { name: 'Salary', type: CategoryType.INCOME, icon: '💼' },
  { name: 'Gifts', type: CategoryType.INCOME, icon: '🎁' },
  { name: 'Other', type: CategoryType.INCOME, icon: '📦' },
];

export interface CategoryImpact {
  categoryId: string;
  transactions: number;
  recurringPayments: number;
  subcategories: number;
  lastUsedAt: string | null;
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(RecurringPayment) private readonly recurringRepo: Repository<RecurringPayment>,
  ) {}

  /** Enables the default set for a brand-new household (#325). Idempotent — safe for at-least-once Kafka delivery. */
  async seedDefaults(householdId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Category)
      .values(
        DEFAULT_CATEGORIES.map((c) => ({
          householdId,
          name: c.name,
          nameNormalized: normalizeCategoryName(c.name),
          type: c.type,
          icon: c.icon,
          parentId: null,
        })),
      )
      // Conflicts against idx_categories_household_type_name_unique. Without
      // that index this would insert duplicates rather than ignore them.
      .orIgnore()
      .execute();
    this.logger.log('Seeded default categories for household');
  }

  // Self-healing fallback for the household.created Kafka delivery race, and
  // for tests (KafkaConsumerService.subscribe() is mocked there, so the
  // consumer never fires). Same shape as CurrenciesService/AccountTypesService.
  //
  // Keyed on "has this household ever had a category", including archived
  // ones — otherwise a household that deliberately archived every default
  // would have them silently reinstated on the next list.
  private async ensureSeeded(householdId: string): Promise<void> {
    const hasAny = await this.repo.exists({ where: { householdId } });
    if (!hasAny) {
      await this.seedDefaults(householdId);
    }
  }

  async create(householdId: string, dto: CreateCategoryDto): Promise<Category> {
    const parentId = await this.resolveParent(householdId, dto.parentId, dto.type);
    return this.save(
      this.repo.create({
        householdId,
        name: dto.name,
        nameNormalized: normalizeCategoryName(dto.name),
        type: dto.type,
        icon: dto.icon ?? null,
        parentId,
      }),
      dto.name,
    );
  }

  async findAll(householdId: string, type?: CategoryType, includeArchived = false): Promise<Category[]> {
    await this.ensureSeeded(householdId);
    const where: Record<string, unknown> = { householdId };
    if (type) where['type'] = type;
    if (!includeArchived) where['isArchived'] = false;
    return this.repo.find({ where, order: { name: 'ASC' }, take: LIST_HARD_LIMIT });
  }

  async findOne(id: string, householdId: string): Promise<Category> {
    const cat = await this.repo.findOne({ where: { id, householdId } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async update(id: string, householdId: string, dto: UpdateCategoryDto): Promise<Category> {
    const existing = await this.findOne(id, householdId);

    const nextType = dto.type ?? existing.type;
    const parentId =
      dto.parentId === undefined
        ? undefined
        : await this.resolveParent(householdId, dto.parentId, nextType, id);

    const patch: Partial<Category> = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
      patch.nameNormalized = normalizeCategoryName(dto.name);
    }
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.icon !== undefined) patch.icon = dto.icon ?? null;
    if (parentId !== undefined) patch.parentId = parentId;

    if (Object.keys(patch).length > 0) {
      try {
        await this.repo.update(id, patch);
      } catch (err) {
        this.rethrowDuplicate(err, dto.name ?? existing.name);
      }
    }
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.update(id, { isArchived: true });
  }

  async permanentDelete(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    const impact = await this.getImpact(id, householdId);
    const total = impact.transactions + impact.recurringPayments + impact.subcategories;
    if (total > 0) {
      // Body is picked up by HttpExceptionFilter — extra keys (impact) are
      // passed through to the response. UI can rely on this shape even if
      // its own upfront getImpact() call was stale.
      throw new ConflictException({
        message: 'Cannot permanently delete category with existing references',
        impact: {
          transactions: impact.transactions,
          recurringPayments: impact.recurringPayments,
          subcategories: impact.subcategories,
        },
      });
    }
    await this.repo.delete(id);
  }

  async unarchive(id: string, householdId: string): Promise<Category> {
    await this.findOne(id, householdId);
    await this.repo.update(id, { isArchived: false });
    return this.findOne(id, householdId);
  }

  /**
   * Validates a requested parent and returns the value to store.
   *
   * Without this, `parentId` was written straight through from the DTO — so a
   * caller could nest their category under another household's, which is the
   * IDOR shape past audits kept finding. It only became reachable when #325
   * gave the UI a way to create categories at all.
   *
   * Also refuses a parent of a different type (an expense category under an
   * income one makes no sense to report on) and self-parenting. Only one level
   * is checked because the UI only offers top-level categories as parents; a
   * deeper tree would need a full cycle walk.
   */
  private async resolveParent(
    householdId: string,
    parentId: string | null | undefined,
    type: CategoryType,
    selfId?: string,
  ): Promise<string | null> {
    if (!parentId) return null;
    if (selfId && parentId === selfId) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    // Scoped by householdId — a foreign id is a 404, not a silent link.
    const parent = await this.findOne(parentId, householdId);
    if (parent.type !== type) {
      throw new BadRequestException(
        `Parent category "${parent.name}" is ${parent.type}, which does not match ${type}`,
      );
    }
    if (parent.parentId) {
      throw new BadRequestException(
        `"${parent.name}" is already a sub-category — nesting is limited to one level`,
      );
    }
    return parent.id;
  }

  /** Saves and translates the (household_id, type, lower(name)) unique violation into a 409. */
  private async save(category: Category, name: string): Promise<Category> {
    try {
      return await this.repo.save(category);
    } catch (err) {
      this.rethrowDuplicate(err, name);
    }
  }

  private rethrowDuplicate(err: unknown, name: string): never {
    if (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      throw new ConflictException(
        `A category named "${name}" already exists in this household`,
      );
    }
    throw err;
  }

  async getImpact(id: string, householdId: string): Promise<CategoryImpact> {
    // findOne asserts the category exists AND belongs to this household —
    // prevents impact leakage across tenants (404 otherwise).
    await this.findOne(id, householdId);

    const [transactions, recurringPayments, subcategories, lastUsedRow] = await Promise.all([
      this.txRepo.count({ where: { categoryId: id, householdId } }),
      this.recurringRepo.count({ where: { categoryId: id, householdId } }),
      this.repo.count({ where: { parentId: id, householdId } }),
      this.txRepo
        .createQueryBuilder('t')
        .select('MAX(t.created_at)', 'ts')
        .where('t.category_id = :id AND t.household_id = :hid', { id, hid: householdId })
        .getRawOne<{ ts: Date | string | null }>(),
    ]);

    const lastUsedAt = lastUsedRow?.ts ? new Date(lastUsedRow.ts).toISOString() : null;

    return { categoryId: id, transactions, recurringPayments, subcategories, lastUsedAt };
  }
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}
