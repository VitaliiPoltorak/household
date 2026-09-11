import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '@household/database';
import { FeatureFlagStatus } from './feature-flag-status.enum';
import { FeatureFlagOverride } from './feature-flag-override.entity';

/**
 * Mutable runtime state for one flag. The metadata that must stay in git
 * (key, description, expiry, rollout issue) is authored in
 * libs/contracts/src/feature-flags/registry.ts — this row is upserted from
 * that registry on boot (see FeatureFlagsService.onModuleInit) so the two
 * never drift silently.
 */
@Entity({ name: 'feature_flags', schema: 'household' })
export class FeatureFlag extends BaseEntity {
  @Column({ name: 'flag_key', unique: true })
  flagKey: string;

  @Column()
  description: string;

  @Column({ name: 'enabled_default', default: false })
  enabledDefault: boolean;

  @Column({
    type: 'enum',
    enum: FeatureFlagStatus,
    default: FeatureFlagStatus.DEV,
  })
  status: FeatureFlagStatus;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'rollout_issue_url', type: 'varchar', nullable: true })
  rolloutIssueUrl: string | null;

  @OneToMany(() => FeatureFlagOverride, (o) => o.flag, { cascade: true })
  overrides: FeatureFlagOverride[];
}
