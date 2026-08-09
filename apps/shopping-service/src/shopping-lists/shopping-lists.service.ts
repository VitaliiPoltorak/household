import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { ShoppingList, ListStatus } from './entities/shopping-list.entity';
import {
  CreateShoppingListDto, UpdateShoppingListDto,
} from './dto/shopping-list.dto';
import { StoresService } from '../stores/stores.service';

/**
 * Owns list-level operations only (#91). Item ops live in
 * {@link ShoppingListItemsService}. This split gives each service a single
 * aggregate to own — high cohesion — and lets item logic be reused
 * independently (future: quick-add from Products page bypassing a list).
 */
@Injectable()
export class ShoppingListsService {
  constructor(
    @InjectRepository(ShoppingList)
    private readonly listRepo: Repository<ShoppingList>,
    private readonly stores: StoresService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  // Defence-in-depth per #67: verify a foreign entity referenced by DTO
  // actually belongs to the caller's household. StoresService.findOne is
  // scoped and throws NotFoundException on miss.
  private async assertStoreBelongsToHousehold(
    householdId: string,
    storeId: string | null | undefined,
  ): Promise<void> {
    if (storeId) await this.stores.findOne(storeId, householdId);
  }

  async create(householdId: string, userId: string, dto: CreateShoppingListDto): Promise<ShoppingList> {
    await this.assertStoreBelongsToHousehold(householdId, dto.storeId);
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
    // Sort by name to keep a single source of truth (#79). Web used to
    // re-sort client-side which caused cross-browser inconsistencies when
    // the browser's collation disagreed with PostgreSQL's default.
    return this.listRepo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string, householdId: string): Promise<ShoppingList> {
    const list = await this.listRepo.findOne({ where: { id, householdId } });
    if (!list) throw new NotFoundException('Shopping list not found');
    return list;
  }

  async update(id: string, householdId: string, dto: UpdateShoppingListDto): Promise<ShoppingList> {
    await this.findOne(id, householdId);
    await this.assertStoreBelongsToHousehold(householdId, dto.storeId);
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
    // ShoppingList.items is @OneToMany with eager:true, so findOne above
    // populates it — no cross-service call to ShoppingListItemsService.
    await this.events.emit(
      'shopping.list.completed',
      { listId: id, householdId, itemCount: list.items.length },
      { userId, householdId },
    );
    return updated;
  }
}
