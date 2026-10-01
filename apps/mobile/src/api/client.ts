import { clearSession, loadSession, saveSession } from '../auth/session-store';
import type { LoginResponse } from './types';

// Dev: set EXPO_PUBLIC_API_URL to the gateway's LAN address
// (e.g. http://192.168.1.20:3000/api/v1) — a device can't reach localhost.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// Tells auth-service to return sessionId/refreshToken in the body instead of
// setting cookies (#356).
const PLATFORM_HEADERS = { 'X-Client-Platform': 'mobile' };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CallOptions {
  params?: Record<string, string | number | boolean | undefined>;
  /** Extra headers, e.g. `X-Household-Id` (see householdHeaders). */
  headers?: Record<string, string>;
}

interface RequestOptions extends CallOptions {
  body?: unknown;
  _retry?: boolean;
}

/** Tenant header the gateway forwards to the services (see CLAUDE.md, Multi-tenancy). */
export const householdHeaders = (householdId: string) => ({
  'X-Household-Id': householdId,
});

// Access token is memory-only (#60 rule, mirrored from apps/web).
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;

// AuthProvider registers this so a dead session (refresh rejected) flips the
// route gate back to signed-out without client.ts importing React.
let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(fn: (() => void) | null): void {
  onSessionLost = fn;
}

/** Adopt a login/refresh response: memory for the access token, keychain for the rest. */
export async function adoptTokens(tokens: LoginResponse): Promise<void> {
  accessToken = tokens.accessToken;
  await saveSession({
    sessionId: tokens.sessionId,
    refreshToken: tokens.refreshToken,
  });
}

export async function dropSession(): Promise<void> {
  accessToken = null;
  await clearSession();
}

// Single-flight: refresh tokens rotate, so two concurrent 401s each calling
// /auth/refresh would race and the loser would present an already-rotated
// token and kill the session.
let refreshing: Promise<boolean> | null = null;

/**
 * Exchange the stored refresh token for a new access token.
 * Resolves false when there is no session or the server rejected it (the
 * session is then dropped); throws on network failure so callers can keep
 * the stored session for a later retry.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const stored = await loadSession();
  if (!stored) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...PLATFORM_HEADERS },
    body: JSON.stringify(stored),
  });
  if (res.ok) {
    await adoptTokens((await res.json()) as LoginResponse);
    return true;
  }
  // Only a definitive rejection ends the session; 5xx is transient.
  if (res.status === 401 || res.status === 403) {
    await dropSession();
    return false;
  }
  throw new ApiError(res.status, {}, res.statusText);
}

// class-validator reports a 400 as `message: string[]`.
function messageOf(data: Record<string, unknown>): string | undefined {
  const m = data['message'];
  return Array.isArray(m) ? m.join(', ') : (m as string | undefined);
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { params, headers: extraHeaders, body, _retry = false } = options;

  let url = `${API_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.append(k, String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...PLATFORM_HEADERS,
    ...extraHeaders,
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !_retry && !path.startsWith('/auth/')) {
    let refreshed = false;
    try {
      refreshed = await refreshSession();
    } catch {
      // Network blip during refresh: surface the original 401 but keep the
      // stored session.
    }
    if (refreshed)
      return request<T>(method, path, { ...options, _retry: true });
    if (!(await loadSession())) onSessionLost?.();
    throw new ApiError(401, {}, 'Unauthorized');
  }

  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, data, messageOf(data) ?? res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: CallOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: CallOptions) =>
    request<T>('POST', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: CallOptions) =>
    request<T>('PATCH', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: CallOptions) =>
    request<T>('PUT', path, { ...opts, body }),
  delete: <T = void>(path: string, opts?: CallOptions) =>
    request<T>('DELETE', path, opts),
};
