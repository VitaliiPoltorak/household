import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, CategoryType } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
  ) {}

  create(householdId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.repo.save(
      this.repo.create({ householdId, ...dto, icon: dto.icon ?? null, parentId: dto.parentId ?? null }),
    );
  }

  findAll(householdId: string, type?: CategoryType, includeArchived = false): Promise<Category[]> {
    const where: Record<string, unknown> = { householdId };
    if (type) where['type'] = type;
    if (!includeArchived) where['isArchived'] = false;
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
    await this.repo.update(id, { isArchived: true });
  }

  async unarchive(id: string, householdId: string): Promise<Category> {
    await this.findOne(id, householdId);
    await this.repo.update(id, { isArchived: false });
    return this.findOne(id, householdId);
  }
}
