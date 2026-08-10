import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { LIST_HARD_LIMIT } from '@household/contracts';
import { RecurringPayment } from './entities/recurring-payment.entity';
import { CreateRecurringPaymentDto, UpdateRecurringPaymentDto } from './dto/recurring-payment.dto';

@Injectable()
export class RecurringPaymentsService {
  constructor(
    @InjectRepository(RecurringPayment) private readonly repo: Repository<RecurringPayment>,
  ) {}

  create(householdId: string, dto: CreateRecurringPaymentDto): Promise<RecurringPayment> {
    return this.repo.save(
      this.repo.create({
        householdId,
        ...dto,
        currency: dto.currency ?? 'UAH',
        categoryId: dto.categoryId ?? null,
        accountId: dto.accountId ?? null,
      }),
    );
  }

  findAll(householdId: string): Promise<RecurringPayment[]> {
    return this.repo.find({ where: { householdId }, order: { nextDueDate: 'ASC' }, take: LIST_HARD_LIMIT });
  }

  async findOne(id: string, householdId: string): Promise<RecurringPayment> {
    const p = await this.repo.findOne({ where: { id, householdId } });
    if (!p) throw new NotFoundException('Recurring payment not found');
    return p;
  }

  async update(id: string, householdId: string, dto: UpdateRecurringPaymentDto): Promise<RecurringPayment> {
    await this.findOne(id, householdId);
    await this.repo.update(id, dto);
    return this.findOne(id, householdId);
  }

  async remove(id: string, householdId: string): Promise<void> {
    await this.findOne(id, householdId);
    await this.repo.delete(id);
  }

  findUpcoming(householdId: string, days = 30): Promise<RecurringPayment[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    return this.repo.find({
      where: { householdId, nextDueDate: LessThanOrEqual(cutoff.toISOString().split('T')[0]) },
      order: { nextDueDate: 'ASC' },
      take: LIST_HARD_LIMIT,
    });
  }
}
