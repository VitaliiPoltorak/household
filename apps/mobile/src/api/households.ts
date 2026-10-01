import { api } from './client';
import type { Household } from './types';

export const householdsApi = {
  list: () => api.get<Household[]>('/households'),
};
