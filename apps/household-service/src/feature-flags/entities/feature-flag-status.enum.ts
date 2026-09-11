export enum FeatureFlagStatus {
  DEV = 'dev',
  BETA = 'beta',
  KILL_SWITCH = 'kill-switch',
}

export enum FeatureFlagActorType {
  HOUSEHOLD = 'household',
  USER = 'user',
}

export enum FeatureFlagOverrideSource {
  MANUAL = 'manual',
  SUBSCRIPTION = 'subscription',
}
