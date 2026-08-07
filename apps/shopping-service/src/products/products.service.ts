import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    private readonly stores: StoresService,
  ) {}

  // Prevents IDOR on store references. StoresService.findOne is household-scoped
  // and throws NotFoundException — same shape callers already expect from findOne
  // misses, so 404 propagates naturally.
  private async assertStoresBelongToHousehold(
    householdId: string,
    refs: { preferredStoreId?: string | null; alternativeStoreIds?: string[] | null },
  ): Promise<void> {
    const checks: Promise<unknown>[] = [];
    if (refs.preferredStoreId) checks.push(this.stores.findOne(refs.preferredStoreId, householdId));
    if (refs.alternativeStoreIds?.length) {
      for (const id of refs.alternativeStoreIds) checks.push(this.stores.findOne(id, householdId));
    }
    await Promise.all(checks);
  }

  async create(householdId: string, dto: CreateProductDto): Promise<Product> {
    await this.assertStoresBelongToHousehold(householdId, {
      preferredStoreId: dto.preferredStoreId,
      alternativeStoreIds: dto.alternativeStoreIds,
    });
    return this.repo.save(
      this.repo.create({
        householdId,
        ...dto,
        category: dto.category ?? null,
        unit: dto.unit ?? null,
        preferredStoreId: dto.preferredStoreId ?? null,
        alternativeStoreIds: dto.alternativeStoreIds ?? [],
        lastPrice: dto.lastPrice ?? null,
        notes: dto.notes ?? null,
      }),
    );
  }

  findAll(householdId: string, query: { search?: string; storeId?: string }): Promise<Product[]> {
    const where: Record<string, unknown> = { householdId };
    if (query.search) where['name'] = ILike(`%${query.search}%`);
    if (query.storeId) where['preferredStoreId'] = query.storeId;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string, householdId: string): Promise<Product> {
    const p = await this.repo.findOne({ where: { id, householdId } });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async update(id: string, householdId: string, dto: UpdateProductDto): Promise<Product> {
    await this.findOne(id, householdId);
    await this.assertStoresBelongToHousehold(householdId, {
      preferredStoreId: dto.preferredStoreId,
      alternativeStoreIds: dto.alternativeStoreIds,
    });
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.delete(id);
  }
}
