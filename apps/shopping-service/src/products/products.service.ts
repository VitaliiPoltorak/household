import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
  ) {}

  create(householdId: string, dto: CreateProductDto): Promise<Product> {
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
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.delete(id);
  }
}
