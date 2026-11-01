import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NetWorthSnapshot,
  NetWorthSnapshotSource,
} from './entities/net-worth-snapshot.entity';

const CCY_CODE = /^[A-Za-z0-9]{3,10}$/;

@Injectable()
export class NetWorthSnapshotsService {
  constructor(
    @InjectRepository(NetWorthSnapshot)
    private readonly repo: Repository<NetWorthSnapshot>,
  ) {}

  async list(
    householdId: string,
    from?: string,
    to?: string,
  ): Promise<NetWorthSnapshot[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.household_id = :hid', { hid: householdId });
    if (from) qb.andWhere('s.snapshot_date >= :from', { from });
    if (to) qb.andWhere('s.snapshot_date <= :to', { to });
    return qb.orderBy('s.snapshot_date', 'ASC').getMany();
  }

  /** Manual entry (POST .../snapshots) — always source=manual, reconciling
   *  whatever row (auto or manual) already exists for this date (#379). */
  async createManual(
    householdId: string,
    date: string,
    byCurrency: Record<string, number>,
  ): Promise<NetWorthSnapshot> {
    this.validateByCurrency(byCurrency);
    await this.upsertRows([
      {
        householdId,
        snapshotDate: date,
        byCurrency,
        source: NetWorthSnapshotSource.MANUAL,
      },
    ]);
    return this.repo.findOneByOrFail({
      householdId,
      snapshotDate: date,
    });
  }

  /** Bulk backfill (POST .../snapshots/bulk) — one round trip for many
   *  months of pre-app history, same upsert semantics as a single entry. */
  async createManyManual(
    householdId: string,
    entries: { date: string; byCurrency: Record<string, number> }[],
  ): Promise<void> {
    const dates = new Set(entries.map((e) => e.date));
    if (dates.size !== entries.length) {
      throw new BadRequestException('snapshots must not repeat the same date');
    }
    entries.forEach((e) => this.validateByCurrency(e.byCurrency));
    await this.upsertRows(
      entries.map((e) => ({
        householdId,
        snapshotDate: e.date,
        byCurrency: e.byCurrency,
        source: NetWorthSnapshotSource.MANUAL,
      })),
    );
  }

  /** Scheduler entry point (#406) — takes the already-computed byCurrency
   *  from ReportsService.getNetWorth rather than duplicating the
   *  balance-aggregation SQL here. Tagged `confirmed` so history can tell it
   *  from a legacy 1st-of-month `auto` row. A household with no active
   *  accounts produces an empty byCurrency, which is skipped, not stored. */
  async captureConfirmed(
    householdId: string,
    date: string,
    byCurrency: Record<string, number>,
  ): Promise<void> {
    if (Object.keys(byCurrency).length === 0) return;
    await this.upsertRows([
      {
        householdId,
        snapshotDate: date,
        byCurrency,
        source: NetWorthSnapshotSource.CONFIRMED,
      },
    ]);
  }

  /** Delete a snapshot (#379 follow-up). Manual and confirmed entries only.
   *  A legacy `auto` row stays protected as before. A confirmed row can be
   *  deleted safely: the prompt records `captured_at`, so the catch-up job
   *  never recreates it. */
  async deleteManual(householdId: string, id: string): Promise<void> {
    const snapshot = await this.repo.findOneBy({ id, householdId });
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    if (snapshot.source === NetWorthSnapshotSource.AUTO) {
      throw new BadRequestException(
        'Only manual or confirmed snapshots can be deleted — a legacy auto snapshot is system-managed',
      );
    }
    await this.repo.remove(snapshot);
  }

  private async upsertRows(
    rows: {
      householdId: string;
      snapshotDate: string;
      byCurrency: Record<string, number>;
      source: NetWorthSnapshotSource;
    }[],
  ): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(NetWorthSnapshot)
      .values(rows)
      .orUpdate(
        ['by_currency', 'source', 'updated_at'],
        ['household_id', 'snapshot_date'],
      )
      .execute();
  }

  private validateByCurrency(byCurrency: Record<string, number>): void {
    const entries = Object.entries(byCurrency);
    if (entries.length === 0) {
      throw new BadRequestException(
        'byCurrency must have at least one currency',
      );
    }
    for (const [ccy, amount] of entries) {
      if (!CCY_CODE.test(ccy)) {
        throw new BadRequestException(`Invalid currency code: ${ccy}`);
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        throw new BadRequestException(`Invalid amount for ${ccy}`);
      }
    }
  }
}
