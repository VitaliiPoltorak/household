import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsModule } from '../reports/reports.module';
import { NetWorthSnapshotPrompt } from './entities/net-worth-snapshot-prompt.entity';
import { NetWorthSnapshotPromptService } from './net-worth-snapshot-prompt.service';
import { NetWorthSnapshotPromptController } from './net-worth-snapshot-prompt.controller';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { NetWorthSnapshotsService } from './net-worth-snapshots.service';
import { NetWorthSnapshotsController } from './net-worth-snapshots.controller';
import { NetWorthSnapshotScheduler } from './net-worth-snapshot.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([NetWorthSnapshot, NetWorthSnapshotPrompt]), ReportsModule],
  controllers: [NetWorthSnapshotsController, NetWorthSnapshotPromptController],
  providers: [
    NetWorthSnapshotsService,
    NetWorthSnapshotPromptService,
    NetWorthSnapshotScheduler,
  ],
})
export class NetWorthSnapshotsModule {}
