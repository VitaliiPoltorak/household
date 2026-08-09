import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import i18n from '../i18n';
import type { User, LoginResponse } from '../types/api';
import { authApi } from '../api/auth';
import { clearSession, readCsrfCookie, setAccessToken } from '../api/client';
import type { SupportedLng } from '@household/locales';

function applyLocale(locale: string) {
  const supported: SupportedLng[] = ['en', 'uk', 'de', 'es'];
  const lng = supported.includes(locale as SupportedLng) ? locale : 'en';
  void i18n.changeLanguage(lng);
}

interface AuthState {
  user: User | null;
}

interface AuthContextValue extends AuthState {
  isLoading: boolean;
  // True if the user has legacy localStorage tokens from before the #60
  // migration. UI shows a full-screen banner asking them to re-log in.
  migrationNeeded: boolean;
  login: (tokens: LoginResponse) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Detects users who still have refresh tokens in localStorage from the
 * pre-#60 flow. They can't be silently migrated (the server never got a
 * cookie), so we show a banner asking them to re-authenticate. Cleaned up
 * as soon as they either re-login or manually clear the key.
 */
function hasLegacyLocalStorageAuth(): boolean {
  return localStorage.getItem('refreshToken') !== null || localStorage.getItem('sessionId') !== null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null });
  const [isLoading, setIsLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  useEffect(() => {
    // Migration path takes precedence: if legacy localStorage exists, don't
    // touch the network. The banner UX handles re-auth explicitly.
    if (hasLegacyLocalStorageAuth()) {
      setMigrationNeeded(true);
      setIsLoading(false);
      return;
    }

    // Fresh visit or no session — check the CSRF cookie as a cheap "is
    // logged in?" signal without an unnecessary network round trip. The
    // real refresh token lives in an HttpOnly cookie we can't inspect;
    // the CSRF cookie is set alongside it so its presence is a reliable
    // proxy for "there's probably a session".
    if (!readCsrfCookie()) {
      setIsLoading(false);
      return;
    }

    // Try to bootstrap: refresh with the cookie, then load profile.
    authApi.refresh()
      .then(({ accessToken }) => {
        setAccessToken(accessToken);
        return authApi.getMe();
      })
      .then((user) => {
        applyLocale(user.locale);
        setState({ user });
      })
      .catch(() => {
        // Cookie was stale / server rejected — clean slate.
        clearSession();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (tokens: LoginResponse) => {
    setAccessToken(tokens.accessToken);
    const user = await authApi.getMe();
    applyLocale(user.locale);
    setState({ user });
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => null);
    clearSession();
    setState({ user: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, isLoading, migrationNeeded, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
