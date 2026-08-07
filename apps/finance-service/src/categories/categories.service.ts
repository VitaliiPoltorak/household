import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, CategoryType } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecurringPayment } from '../recurring-payments/entities/recurring-payment.entity';

export interface CategoryImpact {
  categoryId: string;
  transactions: number;
  recurringPayments: number;
  subcategories: number;
  lastUsedAt: string | null;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(RecurringPayment) private readonly recurringRepo: Repository<RecurringPayment>,
  ) {}

  create(householdId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.repo.save(
      this.repo.create({ householdId, ...dto, icon: dto.icon ?? null, parentId: dto.parentId ?? null }),
    );
  }

  findAll(householdId: string, type?: CategoryType): Promise<Category[]> {
    const where: Record<string, unknown> = { householdId };
    if (type) where['type'] = type;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string, householdId: string): Promise<Category> {
    const cat = await this.repo.findOne({ where: { id, householdId } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async update(id: string, householdId: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id, householdId);
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.delete(id);
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
