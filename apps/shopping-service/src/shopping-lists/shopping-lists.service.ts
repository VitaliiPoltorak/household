import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaProducerService } from '@household/kafka';
import { ShoppingList, ListStatus } from './entities/shopping-list.entity';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import {
  CreateShoppingListDto, UpdateShoppingListDto,
  CreateItemDto, UpdateItemDto,
} from './dto/shopping-list.dto';

@Injectable()
export class ShoppingListsService {
  constructor(
    @InjectRepository(ShoppingList)
    private readonly listRepo: Repository<ShoppingList>,
    @InjectRepository(ShoppingListItem)
    private readonly itemRepo: Repository<ShoppingListItem>,
    private readonly kafka: KafkaProducerService,
  ) {}

  create(householdId: string, userId: string, dto: CreateShoppingListDto): Promise<ShoppingList> {
    return this.listRepo.save(
      this.listRepo.create({
        householdId,
        createdBy: userId,
        name: dto.name,
        storeId: dto.storeId ?? null,
        status: ListStatus.ACTIVE,
      }),
    );
  }

  findAll(householdId: string, status?: ListStatus): Promise<ShoppingList[]> {
    const where: Record<string, unknown> = { householdId };
    if (status) where['status'] = status;
    return this.listRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, householdId: string): Promise<ShoppingList> {
    const list = await this.listRepo.findOne({ where: { id, householdId } });
    if (!list) throw new NotFoundException('Shopping list not found');
    return list;
  }

  async update(id: string, householdId: string, dto: UpdateShoppingListDto): Promise<ShoppingList> {
    await this.findOne(id, householdId);
    await this.listRepo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.listRepo.delete(id);
  }

  async complete(id: string, householdId: string, userId: string): Promise<ShoppingList> {
    const list = await this.findOne(id, householdId);
    if (list.status !== ListStatus.ACTIVE) {
      throw new BadRequestException('Only active lists can be completed');
    }
    await this.listRepo.update(id, { status: ListStatus.COMPLETED });
    const updated = await this.findOne(id, householdId);
    await this.kafka.emit(
      'shopping.list.completed',
      { listId: id, householdId, itemCount: list.items.length },
      { userId, householdId },
    );
    return updated;
  }

  // --- Items ---

  async addItem(listId: string, householdId: string, dto: CreateItemDto): Promise<ShoppingListItem> {
    await this.findOne(listId, householdId);
    return this.itemRepo.save(
      this.itemRepo.create({
        listId,
        name: dto.name,
        productId: dto.productId ?? null,
        quantity: dto.quantity ?? 1,
        unit: dto.unit ?? null,
        preferredStoreId: dto.preferredStoreId ?? null,
        actualStoreId: null,
        isPurchased: false,
        price: null,
      }),
    );
  }

  async updateItem(
    listId: string,
    itemId: string,
    householdId: string,
    dto: UpdateItemDto,
    userId: string,
  ): Promise<ShoppingListItem> {
    await this.findOne(listId, householdId);
    const item = await this.itemRepo.findOne({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException('Item not found');

    const wasPurchased = item.isPurchased;
    await this.itemRepo.update(itemId, dto);

    if (!wasPurchased && dto.isPurchased) {
      await this.kafka.emit(
        'shopping.item.purchased',
        { listId, itemId, householdId, name: item.name, price: dto.price ?? null },
        { userId, householdId },
      );
    }

    return this.itemRepo.findOneOrFail({ where: { id: itemId } });
  }

  async removeItem(listId: string, itemId: string, householdId: string): Promise<void> {
    await this.findOne(listId, householdId);
    const item = await this.itemRepo.findOne({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.itemRepo.delete(itemId);
  }
}
