import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LIST_HARD_LIMIT } from '@household/contracts';
import { Store } from './entities/store.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { Product } from '../products/entities/product.entity';
import { ShoppingList } from '../shopping-lists/entities/shopping-list.entity';
import { ShoppingListItem } from '../shopping-lists/entities/shopping-list-item.entity';

export interface StoreImpact {
  storeId: string;
  products: number;
  lists: number;
  items: number;
}

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly repo: Repository<Store>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ShoppingList)
    private readonly listRepo: Repository<ShoppingList>,
    @InjectRepository(ShoppingListItem)
    private readonly itemRepo: Repository<ShoppingListItem>,
  ) {}

  create(householdId: string, dto: CreateStoreDto): Promise<Store> {
    return this.repo.save(
      this.repo.create({ householdId, ...dto, address: dto.address ?? null }),
    );
  }

  findAll(householdId: string): Promise<Store[]> {
    return this.repo.find({
      where: { householdId },
      order: { name: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }

  async findOne(id: string, householdId: string): Promise<Store> {
    const store = await this.repo.findOne({ where: { id, householdId } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async update(
    id: string,
    householdId: string,
    dto: UpdateStoreDto,
  ): Promise<Store> {
    await this.findOne(id, householdId);
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async getImpact(id: string, householdId: string): Promise<StoreImpact> {
    // findOne asserts the store exists AND belongs to this household —
    // prevents impact leakage across tenants (404 otherwise).
    await this.findOne(id, householdId);

    const [products, lists, items] = await Promise.all([
      this.productRepo
        .createQueryBuilder('p')
        .where('p.preferred_store_id = :id', { id })
        .orWhere('p.alternative_store_ids @> :idJson', {
          idJson: JSON.stringify([id]),
        })
        .getCount(),
      this.listRepo.count({ where: { storeId: id } }),
      this.itemRepo
        .createQueryBuilder('i')
        .where('i.preferred_store_id = :id', { id })
        .orWhere('i.actual_store_id = :id', { id })
        .getCount(),
    ]);

    return { storeId: id, products, lists, items };
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    const impact = await this.getImpact(id, householdId);
    const total = impact.products + impact.lists + impact.items;
    if (total > 0) {
      // Body picked up by HttpExceptionFilter — same "409 + impact" shape as
      // CategoriesService.permanentDelete, so the UI can render it uniformly.
      throw new ConflictException({
        message: 'Cannot delete store with existing references',
        impact,
      });
    }
    await this.repo.delete(id);
  }
}
