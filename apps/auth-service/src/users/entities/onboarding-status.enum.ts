// Tracks the new-user onboarding wizard (#347). `PENDING` is the only value
// that auto-opens the wizard on login; every other value means the user has
// already made a choice about it (either the first time, or via the
// re-entry (i) button) and it stays closed until they open it manually.
export enum OnboardingStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  REVIEWED_LATER = 'reviewed_later',
}
