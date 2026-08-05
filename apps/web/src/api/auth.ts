import { apiClient } from './client';
import type { TokenPair, User } from '../types/api';

export const authApi = {
  loginWithGoogle: (idToken: string) =>
    apiClient.post<TokenPair>('/auth/google', { idToken, deviceInfo: 'Web' }).then((r) => r.data),

  refresh: (sessionId: string, refreshToken: string) =>
    apiClient.post<TokenPair>('/auth/refresh', { sessionId, refreshToken }).then((r) => r.data),

  logout: (sessionId: string) =>
    apiClient.post('/auth/logout', { sessionId }),

  getMe: () => apiClient.get<User>('/auth/me').then((r) => r.data),

  updateProfile: (data: { displayName?: string; locale?: string }) =>
    apiClient.patch<User>('/auth/me', data).then((r) => r.data),

  deleteAccount: () => apiClient.delete('/auth/me'),
};
