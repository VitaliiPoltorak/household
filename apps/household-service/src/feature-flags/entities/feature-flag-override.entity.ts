import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@household/database';
import { FeatureFlag } from './feature-flag.entity';
import {
  FeatureFlagActorType,
  FeatureFlagOverrideSource,
} from './feature-flag-status.enum';

/**
 * One resolved override for a single (flag, actor) pair. Resolution order
 * (FeatureFlagsService.resolve) is user override -> household override ->
 * FeatureFlag.enabledDefault. `source: 'subscription'` is how #230's
 * paid-feature gating rides this same table — billing logic writes a row
 * here exactly like a manual admin toggle does.
 */
@Entity({ name: 'feature_flag_overrides', schema: 'household' })
@Unique(['flagId', 'actorType', 'actorId'])
export class FeatureFlagOverride extends BaseEntity {
  @Column({ name: 'flag_id' })
  flagId: string;

  @Column({ name: 'actor_type', type: 'enum', enum: FeatureFlagActorType })
  actorType: FeatureFlagActorType;

  @Column({ name: 'actor_id' })
  actorId: string;

  @Column()
  enabled: boolean;

  @Column({
    type: 'enum',
    enum: FeatureFlagOverrideSource,
    default: FeatureFlagOverrideSource.MANUAL,
  })
  source: FeatureFlagOverrideSource;

  @ManyToOne(() => FeatureFlag, (f) => f.overrides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flag_id' })
  flag: FeatureFlag;
}
