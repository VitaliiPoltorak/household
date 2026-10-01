import { Platform } from 'react-native';
import { api } from './client';
import type { LoginResponse, RegisterResponse, User } from './types';

const deviceInfo = `Mobile (${Platform.OS})`;

export const authApi = {
  loginWithPassword: (input: { email: string; password: string }) =>
    api.post<LoginResponse>('/auth/login', { ...input, deviceInfo }),

  register: (input: { email: string; password: string; displayName: string }) =>
    api.post<RegisterResponse>('/auth/register', { ...input, deviceInfo }),

  verifyEmail: (input: { email: string; code: string }) =>
    api.post<LoginResponse>('/auth/verify-email', { ...input, deviceInfo }),

  resendVerification: (email: string) =>
    api.post<{ ok: true }>('/auth/verify-email/resend', { email }),

  loginWithGoogle: (idToken: string) =>
    api.post<LoginResponse>('/auth/google', { idToken, deviceInfo }),

  // Body-based on mobile: the server has no cookie to read the session from.
  logout: (sessionId: string) => api.post<void>('/auth/logout', { sessionId }),

  getMe: () => api.get<User>('/auth/me'),
};
