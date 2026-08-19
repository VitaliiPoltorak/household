import { api } from './client';
import type {
  LoginResponse,
  PublicUserProfile,
  RegisterResponse,
  User,
} from '../types/api';

export const authApi = {
  loginWithGoogle: (idToken: string) =>
    api.post<LoginResponse>('/auth/google', { idToken, deviceInfo: 'Web' }),

  register: (input: { email: string; password: string; displayName: string }) =>
    api.post<RegisterResponse>('/auth/register', { ...input, deviceInfo: 'Web' }),

  verifyEmail: (input: { email: string; code: string }) =>
    api.post<LoginResponse>('/auth/verify-email', { ...input, deviceInfo: 'Web' }),

  resendVerification: (email: string) =>
    api.post<{ ok: true }>('/auth/verify-email/resend', { email }),

  loginWithPassword: (input: { email: string; password: string }) =>
    api.post<LoginResponse>('/auth/login', { ...input, deviceInfo: 'Web' }),

  unlockAccount: (token: string) =>
    api.post<void>('/auth/unlock', { token }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    api.post<LoginResponse>('/auth/password/change', { ...input, deviceInfo: 'Web' }),

  // No arguments — refresh cookie rides via credentials: 'include' and the
  // CSRF header is attached automatically by client.ts (#60/#61).
  refresh: () => api.post<LoginResponse>('/auth/refresh'),

  // No body — server reads the session id from the refresh cookie.
  logout: () => api.post('/auth/logout'),

  logoutAll: () => api.post('/auth/logout-all', {}),

  getMe: () => api.get<User>('/auth/me'),

  updateProfile: (data: { displayName?: string; avatarUrl?: string; locale?: string }) =>
    api.patch<User>('/auth/me', data),

  deleteAccount: () => api.delete('/auth/me'),

  /**
   * Bulk-resolve userIds to display name + avatar for the member list. Missing
   * ids are silently omitted server-side (#166).
   *
   * Caller MUST pass a sorted ids list if it wants stable cache keys. The
   * helper below dedupes and hides an empty request from the network.
   */
  getUsers: async (ids: string[]): Promise<PublicUserProfile[]> => {
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (unique.length === 0) return [];
    return api.get<PublicUserProfile[]>('/auth/users', {
      params: { ids: unique.join(',') },
    });
  },
};
