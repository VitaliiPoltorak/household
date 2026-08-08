import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { EVENT_PUBLISHER, IEventPublisher } from '@household/contracts';
import { PaymentFrequency, RecurringPayment } from './entities/recurring-payment.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionType } from '../transactions/entities/transaction.entity';

/**
 * Fires recurring payments whose nextDueDate has arrived.
 *
 * Idempotency: after firing, nextDueDate is advanced by the payment's
 * frequency. A crashed / restarted scheduler naturally skips already-fired
 * payments because their nextDueDate is now in the future.
 *
 * Catch-up policy: one fire per cron run per payment. If the process was
 * down for N periods, catch-up spreads across N daily cron runs. Deliberate
 * — keeps the batch bounded and avoids one bad payment monopolising a run.
 */
@Injectable()
export class RecurringPaymentScheduler {
  private readonly logger = new Logger(RecurringPaymentScheduler.name);

  constructor(
    @InjectRepository(RecurringPayment) private readonly repo: Repository<RecurringPayment>,
    private readonly transactions: TransactionsService,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  @Cron('0 3 * * *', { name: 'fireDueRecurringPayments', timeZone: 'UTC' })
  async fireDueRecurringPayments(): Promise<void> {
    const today = this.today();
    const due = await this.repo.find({ where: { nextDueDate: LessThanOrEqual(today) } });
    if (due.length === 0) {
      this.logger.debug('No recurring payments due today');
      return;
    }
    this.logger.log(`Firing ${due.length} due recurring payment(s)`);
    for (const payment of due) {
      try {
        await this.firePayment(payment);
      } catch (err) {
        // One bad payment must not abort the batch. The row keeps its
        // nextDueDate, so tomorrow's cron will retry it naturally.
        this.logger.error(
          `Failed to fire recurring payment ${payment.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Public so integration tests can trigger a single payment without waiting
  // on cron. Not exposed via any controller.
  async firePayment(payment: RecurringPayment): Promise<void> {
    if (!payment.accountId) {
      // No account → can't produce a transaction. Advance the due date anyway
      // so the row doesn't block every subsequent cron run.
      this.logger.warn(`Recurring payment ${payment.id} has no accountId — advancing due date only`);
      await this.repo.update(payment.id, {
        nextDueDate: this.advanceDate(payment.nextDueDate, payment.frequency),
      });
      return;
    }

    const scheduledDate = payment.nextDueDate;
    const tx = await this.transactions.create(payment.householdId, 'system', {
      accountId: payment.accountId,
      // Recurring entity has no `type` today — every recurring payment is
      // treated as an expense (Netflix / rent / subscription). Adding
      // income-side recurrence would require a schema addition; tracked
      // as a follow-up.
      type: TransactionType.EXPENSE,
      amount: Number(payment.amount),
      currency: payment.currency,
      categoryId: payment.categoryId ?? undefined,
      description: `${payment.name} (recurring)`,
      date: scheduledDate,
    });

    await this.repo.update(payment.id, {
      nextDueDate: this.advanceDate(scheduledDate, payment.frequency),
    });

    await this.events.emit(
      'finance.recurring.triggered',
      {
        recurringPaymentId: payment.id,
        transactionId: tx.id,
        householdId: payment.householdId,
        scheduledDate,
      },
      { userId: 'system', householdId: payment.householdId },
    );
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private advanceDate(current: string, frequency: PaymentFrequency): string {
    const d = new Date(`${current}T00:00:00Z`);
    switch (frequency) {
      case PaymentFrequency.WEEKLY:
        d.setUTCDate(d.getUTCDate() + 7);
        break;
      case PaymentFrequency.MONTHLY:
        d.setUTCMonth(d.getUTCMonth() + 1);
        break;
      case PaymentFrequency.YEARLY:
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        break;
    }
    return d.toISOString().slice(0, 10);
  }
}
