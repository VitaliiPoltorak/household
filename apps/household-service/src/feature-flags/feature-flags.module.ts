import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FeatureFlagOverride } from './entities/feature-flag-override.entity';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag, FeatureFlagOverride]),
    HouseholdsModule,
  ],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
