import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly repo: Repository<Store>,
  ) {}

  create(householdId: string, dto: CreateStoreDto): Promise<Store> {
    return this.repo.save(
      this.repo.create({ householdId, ...dto, address: dto.address ?? null }),
    );
  }

  findAll(householdId: string): Promise<Store[]> {
    return this.repo.find({ where: { householdId }, order: { name: 'ASC' } });
  }

  async findOne(id: string, householdId: string): Promise<Store> {
    const store = await this.repo.findOne({ where: { id, householdId } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async update(id: string, householdId: string, dto: UpdateStoreDto): Promise<Store> {
    await this.findOne(id, householdId);
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.delete(id);
  }
}
