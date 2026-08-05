import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const apiClient = axios.create({ baseURL: API_URL });

// Inject access token on every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401: try refresh, retry once, else clear session
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const sessionId = localStorage.getItem('sessionId');
      const refreshToken = localStorage.getItem('refreshToken');
      if (sessionId && refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            sessionId,
            refreshToken,
          });
          localStorage.setItem('accessToken', data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return apiClient(original);
        } catch {
          clearSession();
          window.location.href = '/login';
        }
      } else {
        clearSession();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('sessionId');
  localStorage.removeItem('user');
}
