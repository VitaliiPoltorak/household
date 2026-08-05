
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
  const token = localStorage.getItem('accessToken');
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 → try refresh once, retry
  if (res.status === 401 && !_retry) {
    const sessionId = localStorage.getItem('sessionId');
    const refreshToken = localStorage.getItem('refreshToken');

    if (sessionId && refreshToken) {
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, refreshToken }),
        });
        if (refreshRes.ok) {
          const data = (await refreshRes.json()) as { accessToken: string };
          localStorage.setItem('accessToken', data.accessToken);
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
