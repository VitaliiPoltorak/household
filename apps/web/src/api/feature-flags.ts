import { api } from './client';

export type ResolvedFeatureFlags = Record<string, boolean>;

export const featureFlagsApi = {
  resolveAll: (hid?: string) =>
    api.get<ResolvedFeatureFlags>('/feature-flags', {
      headers: hid ? { 'X-Household-Id': hid } : undefined,
    }),
};
