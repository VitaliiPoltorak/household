import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncomeSource } from './entities/income-source.entity';
import { CreateIncomeSourceDto, UpdateIncomeSourceDto } from './dto/income-source.dto';

@Injectable()
export class IncomeSourcesService {
  constructor(
    @InjectRepository(IncomeSource) private readonly repo: Repository<IncomeSource>,
  ) {}

  create(householdId: string, dto: CreateIncomeSourceDto): Promise<IncomeSource> {
    return this.repo.save(this.repo.create({ householdId, ...dto }));
  }

  findAll(householdId: string): Promise<IncomeSource[]> {
    return this.repo.find({ where: { householdId } });
  }

  async findOne(id: string, householdId: string): Promise<IncomeSource> {
    const src = await this.repo.findOne({ where: { id, householdId } });
    if (!src) throw new NotFoundException('Income source not found');
    return src;
  }

  async update(id: string, householdId: string, dto: UpdateIncomeSourceDto): Promise<IncomeSource> {
    await this.findOne(id, householdId);
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.delete(id);
  }
}
