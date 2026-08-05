import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import i18n from '../i18n';
import type { User, TokenPair } from '../types/api';
import { authApi } from '../api/auth';
import { clearSession } from '../api/client';
import type { SupportedLng } from '@household/locales';

function applyLocale(locale: string) {
  const supported: SupportedLng[] = ['en', 'uk', 'de', 'es'];
  const lng = supported.includes(locale as SupportedLng) ? locale : 'en';
  void i18n.changeLanguage(lng);
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  sessionId: string | null;
}

interface AuthContextValue extends AuthState {
  isLoading: boolean;
  login: (tokens: TokenPair) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: localStorage.getItem('accessToken'),
    sessionId: localStorage.getItem('sessionId'),
  });
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem('accessToken'));

  useEffect(() => {
    if (!state.accessToken) { setIsLoading(false); return; }
    authApi.getMe()
      .then((user) => { applyLocale(user.locale); setState((s) => ({ ...s, user })); })
      .catch(() => { clearSession(); setState({ user: null, accessToken: null, sessionId: null }); })
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (tokens: TokenPair) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('sessionId', tokens.sessionId);
    const user = await authApi.getMe();
    applyLocale(user.locale);
    setState({ user, accessToken: tokens.accessToken, sessionId: tokens.sessionId });
  }, []);

  const logout = useCallback(async () => {
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId) await authApi.logout(sessionId).catch(() => null);
    clearSession();
    setState({ user: null, accessToken: null, sessionId: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
