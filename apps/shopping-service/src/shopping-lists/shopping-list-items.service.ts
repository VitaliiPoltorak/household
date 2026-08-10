import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import { CreateItemDto, UpdateItemDto } from './dto/shopping-list.dto';
import { ShoppingListsService } from './shopping-lists.service';
import { StoresService } from '../stores/stores.service';
import { ProductsService } from '../products/products.service';

/**
 * Owns item-level operations for a shopping list (#91). Extracted from
 * ShoppingListsService, which used to manage BOTH aggregates. High-cohesion
 * split: list ops (create/complete/archive the container) and item ops
 * (add/tick/remove entries) don't share state and only share the
 * household-scoping guard.
 *
 * Depends on ShoppingListsService.findOne for the "does this list belong to
 * the caller's household?" check — keeps that assertion in one place.
 */
@Injectable()
export class ShoppingListItemsService {
  constructor(
    @InjectRepository(ShoppingListItem)
    private readonly itemRepo: Repository<ShoppingListItem>,
    private readonly lists: ShoppingListsService,
    private readonly stores: StoresService,
    private readonly products: ProductsService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  // Same defence-in-depth as ShoppingListsService (#67). Kept as a small
  // duplicate rather than a shared helper — the two services will diverge
  // as the domain grows and a shared util would force artificial coupling.
  private async assertReferencesBelongToHousehold(
    householdId: string,
    refs: {
      productId?: string | null;
      preferredStoreId?: string | null;
      actualStoreId?: string | null;
    },
  ): Promise<void> {
    const checks: Promise<unknown>[] = [];
    if (refs.productId) checks.push(this.products.findOne(refs.productId, householdId));
    if (refs.preferredStoreId) checks.push(this.stores.findOne(refs.preferredStoreId, householdId));
    if (refs.actualStoreId) checks.push(this.stores.findOne(refs.actualStoreId, householdId));
    await Promise.all(checks);
  }

  async addItem(listId: string, householdId: string, dto: CreateItemDto): Promise<ShoppingListItem> {
    await this.lists.findOne(listId, householdId);
    await this.assertReferencesBelongToHousehold(householdId, {
      productId: dto.productId,
      preferredStoreId: dto.preferredStoreId,
    });
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
    await this.lists.findOne(listId, householdId);
    const item = await this.itemRepo.findOne({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException('Item not found');

    await this.assertReferencesBelongToHousehold(householdId, {
      productId: dto.productId,
      preferredStoreId: dto.preferredStoreId,
      actualStoreId: dto.actualStoreId,
    });

    const wasPurchased = item.isPurchased;
    await this.itemRepo.update(itemId, dto);

    if (!wasPurchased && dto.isPurchased) {
      await this.events.emit(
        'shopping.item.purchased',
        { listId, itemId, householdId, name: item.name, price: dto.price ?? null },
        { userId, householdId },
      );
    }

    return this.itemRepo.findOneOrFail({ where: { id: itemId } });
  }

  async removeItem(listId: string, itemId: string, householdId: string): Promise<void> {
    await this.lists.findOne(listId, householdId);
    const item = await this.itemRepo.findOne({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.itemRepo.delete(itemId);
  }
}
