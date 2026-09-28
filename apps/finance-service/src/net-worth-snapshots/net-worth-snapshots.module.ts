import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsModule } from '../reports/reports.module';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { NetWorthSnapshotsService } from './net-worth-snapshots.service';
import { NetWorthSnapshotsController } from './net-worth-snapshots.controller';
import { NetWorthSnapshotScheduler } from './net-worth-snapshot.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([NetWorthSnapshot]), ReportsModule],
  controllers: [NetWorthSnapshotsController],
  providers: [NetWorthSnapshotsService, NetWorthSnapshotScheduler],
})
export class NetWorthSnapshotsModule {}
