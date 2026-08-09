import { api } from './client';
import type { LoginResponse, User } from '../types/api';

export const authApi = {
  loginWithGoogle: (idToken: string) =>
    api.post<LoginResponse>('/auth/google', { idToken, deviceInfo: 'Web' }),

  // No arguments — refresh cookie rides via credentials: 'include' and the
  // CSRF header is attached automatically by client.ts (#60/#61).
  refresh: () => api.post<LoginResponse>('/auth/refresh'),

  // No body — server reads the session id from the refresh cookie.
  logout: () => api.post('/auth/logout'),

  logoutAll: () => api.post('/auth/logout-all', {}),

  getMe: () => api.get<User>('/auth/me'),

  updateProfile: (data: { displayName?: string; locale?: string }) =>
    api.patch<User>('/auth/me', data),

  deleteAccount: () => api.delete('/auth/me'),
};
