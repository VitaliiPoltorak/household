import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EVENT_PUBLISHER,
  FEATURE_FLAG_UPDATED_EVENT,
  FEATURE_FLAGS,
  IEventPublisher,
  type FeatureFlagState,
} from '@household/contracts';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FeatureFlagOverride } from './entities/feature-flag-override.entity';
import {
  FeatureFlagActorType,
  FeatureFlagOverrideSource,
  FeatureFlagStatus,
} from './entities/feature-flag-status.enum';

export interface RawFeatureFlagStates {
  default: boolean;
  household: FeatureFlagState;
  user: FeatureFlagState;
}

/**
 * Owns the mutable runtime state for every flag. Descriptive metadata (key,
 * description, status, expiry, rollout issue) is seeded from the in-git
 * registry (libs/contracts/src/feature-flags/registry.ts) on boot and kept
 * in sync there — but `enabledDefault` is only ever set at CREATE time.
 * Re-syncing it from the registry on every boot would silently undo a
 * runtime toggle made via scripts/feature-flag.js.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagRepo: Repository<FeatureFlag>,
    @InjectRepository(FeatureFlagOverride)
    private readonly overrideRepo: Repository<FeatureFlagOverride>,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const def of FEATURE_FLAGS) {
      const existing = await this.flagRepo.findOne({
        where: { flagKey: def.key },
      });
      const metadata = {
        description: def.description,
        status: def.status as FeatureFlagStatus,
        expiresAt: def.expiresAt ? new Date(def.expiresAt) : null,
        rolloutIssueUrl: def.rolloutIssueUrl ?? null,
      };
      if (!existing) {
        await this.flagRepo.save(
          this.flagRepo.create({
            flagKey: def.key,
            enabledDefault: def.enabledDefault,
            ...metadata,
          }),
        );
        this.logger.log(`Seeded feature flag '${def.key}' from registry`);
      } else {
        await this.flagRepo.update(existing.id, metadata);
      }
    }
  }

  /** Resolved value of every registered flag for one caller. Powers `GET /feature-flags`. */
  async resolveAll(actor: {
    userId: string;
    householdId?: string;
  }): Promise<Record<string, boolean>> {
    const flags = await this.flagRepo.find();
    const result: Record<string, boolean> = {};
    for (const flag of flags) {
      const [household, user] = await Promise.all([
        actor.householdId
          ? this.findOverrideState(
              flag.id,
              FeatureFlagActorType.HOUSEHOLD,
              actor.householdId,
            )
          : Promise.resolve<FeatureFlagState>('none'),
        this.findOverrideState(
          flag.id,
          FeatureFlagActorType.USER,
          actor.userId,
        ),
      ]);
      result[flag.flagKey] = this.resolve(flag.enabledDefault, household, user);
    }
    return result;
  }

  /** Raw per-actor state, uninterpreted. Powers the internal client used by @household/feature-flags. */
  async getRawState(
    flagKey: string,
    actor: { userId?: string; householdId?: string },
  ): Promise<RawFeatureFlagStates> {
    const flag = await this.requireFlag(flagKey);
    const [household, user] = await Promise.all([
      actor.householdId
        ? this.findOverrideState(
            flag.id,
            FeatureFlagActorType.HOUSEHOLD,
            actor.householdId,
          )
        : Promise.resolve<FeatureFlagState>('none'),
      actor.userId
        ? this.findOverrideState(
            flag.id,
            FeatureFlagActorType.USER,
            actor.userId,
          )
        : Promise.resolve<FeatureFlagState>('none'),
    ]);
    return { default: flag.enabledDefault, household, user };
  }

  async setHouseholdOverride(
    flagKey: string,
    householdId: string,
    enabled: boolean,
  ): Promise<void> {
    const flag = await this.requireFlag(flagKey);
    await this.overrideRepo.upsert(
      {
        flagId: flag.id,
        actorType: FeatureFlagActorType.HOUSEHOLD,
        actorId: householdId,
        enabled,
        source: FeatureFlagOverrideSource.MANUAL,
      },
      ['flagId', 'actorType', 'actorId'],
    );
    await this.publishUpdate(flagKey, 'household', householdId);
  }

  async clearHouseholdOverride(
    flagKey: string,
    householdId: string,
  ): Promise<void> {
    const flag = await this.requireFlag(flagKey);
    await this.overrideRepo.delete({
      flagId: flag.id,
      actorType: FeatureFlagActorType.HOUSEHOLD,
      actorId: householdId,
    });
    await this.publishUpdate(flagKey, 'household', householdId);
  }

  private resolve(
    enabledDefault: boolean,
    household: FeatureFlagState,
    user: FeatureFlagState,
  ): boolean {
    if (user === true || user === false) return user;
    if (household === true || household === false) return household;
    return enabledDefault;
  }

  private async findOverrideState(
    flagId: string,
    actorType: FeatureFlagActorType,
    actorId: string,
  ): Promise<FeatureFlagState> {
    const row = await this.overrideRepo.findOne({
      where: { flagId, actorType, actorId },
    });
    return row ? row.enabled : 'none';
  }

  private async requireFlag(flagKey: string): Promise<FeatureFlag> {
    const flag = await this.flagRepo.findOne({ where: { flagKey } });
    if (!flag) throw new NotFoundException(`Unknown feature flag '${flagKey}'`);
    return flag;
  }

  private async publishUpdate(
    flagKey: string,
    actorType: 'household' | 'user' | 'default',
    actorId?: string,
  ): Promise<void> {
    await this.events.emit(
      FEATURE_FLAG_UPDATED_EVENT,
      { flagKey, actorType, actorId },
      actorType === 'household' ? { householdId: actorId } : undefined,
    );
  }
}
