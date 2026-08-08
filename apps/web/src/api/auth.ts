import { api } from './client';
import type { TokenPair, User } from '../types/api';

export const authApi = {
  loginWithGoogle: (idToken: string) =>
    api.post<TokenPair>('/auth/google', { idToken, deviceInfo: 'Web' }),

  refresh: (sessionId: string, refreshToken: string) =>
    api.post<TokenPair>('/auth/refresh', { sessionId, refreshToken }),

  logout: (sessionId: string) =>
    api.post('/auth/logout', { sessionId }),

  logoutAll: () => api.post('/auth/logout-all', {}),

  getMe: () => api.get<User>('/auth/me'),

  updateProfile: (data: { displayName?: string; locale?: string }) =>
    api.patch<User>('/auth/me', data),

  deleteAccount: () => api.delete('/auth/me'),
};
