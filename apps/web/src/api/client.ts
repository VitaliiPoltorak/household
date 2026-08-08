
const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  _retry?: boolean;
}

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

// Access token is kept in memory only (#60) — never localStorage. AuthContext
// sets it on login and after successful refresh; api/client.ts reads it here.
// A module-level ref keeps client.ts free of React imports (no circular dep
// via AuthContext).
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// The CSRF cookie is deliberately NOT HttpOnly so we can read it here and
// echo it back in the X-CSRF-Token header on the refresh call — that's the
// entire double-submit CSRF pattern (#61).
export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)household_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { headers = {}, params, body, _retry = false } = options;

  // Build URL
  let url = `${API_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.append(k, String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  // Build headers
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (accessToken) reqHeaders['Authorization'] = `Bearer ${accessToken}`;

  // Automatically attach CSRF token to the cookie-authenticated refresh call.
  // Callers don't need to remember — the token is a defence against forged
  // cross-origin POSTs, not a semantic parameter of the operation.
  if (path === '/auth/refresh') {
    const csrf = readCsrfCookie();
    if (csrf) reqHeaders['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Cookies must ride with every request so the cookie-based /auth/refresh
    // and /auth/logout can find them. Regular endpoints don't rely on cookies
    // (they use Authorization Bearer) but sending credentials doesn't hurt.
    credentials: 'include',
  });

  // 401 → try refresh once, retry
  if (res.status === 401 && !_retry) {
    // Only attempt refresh if we appear to have a session (CSRF cookie present).
    // Without it, the refresh call itself would 401/403 — skip the round trip.
    if (readCsrfCookie()) {
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': readCsrfCookie() ?? '',
          },
          credentials: 'include',
        });
        if (refreshRes.ok) {
          const data = (await refreshRes.json()) as { accessToken: string };
          accessToken = data.accessToken;
          return request<T>(method, path, { ...options, _retry: true });
        }
      } catch {
        // refresh request itself failed
      }
    }

    clearSession();
    window.location.href = '/login';
    throw new ApiError(401, {}, 'Unauthorized');
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const responseData = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      responseData,
      (responseData['message'] as string | undefined) ?? res.statusText,
    );
  }

  return responseData as T;
}

export function clearSession() {
  accessToken = null;
  // Legacy keys from the pre-#60 localStorage flow. Users who complete
  // migration land here — clean up so a stale key doesn't re-trigger the
  // migration banner on the next visit.
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('sessionId');
}

type GetOptions = Omit<RequestOptions, 'body' | '_retry'>;
type BodyOptions = Omit<RequestOptions, 'body' | '_retry'>;

export const api = {
  get: <T>(path: string, opts?: GetOptions) =>
    request<T>('GET', path, opts),

  post: <T>(path: string, body?: unknown, opts?: BodyOptions) =>
    request<T>('POST', path, { ...opts, body }),

  patch: <T>(path: string, body?: unknown, opts?: BodyOptions) =>
    request<T>('PATCH', path, { ...opts, body }),

  put: <T>(path: string, body?: unknown, opts?: BodyOptions) =>
    request<T>('PUT', path, { ...opts, body }),

  delete: <T = void>(path: string, opts?: GetOptions) =>
    request<T>('DELETE', path, opts),
};
