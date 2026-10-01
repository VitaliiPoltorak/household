import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/auth';
import {
  adoptTokens,
  dropSession,
  refreshSession,
  setSessionLostHandler,
} from '../api/client';
import type { LoginResponse, User } from '../api/types';
import { loadSession } from './session-store';

interface AuthState {
  /** True until the stored session (if any) has been tried at launch. */
  isLoading: boolean;
  user: User | null;
  isSignedIn: boolean;
  /** Adopt a login/verify/OAuth response and load the profile. */
  signIn: (tokens: LoginResponse) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // Launch: a stored refresh token → new access token → profile. Network
  // failure leaves the keychain alone, so the next launch retries.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if ((await loadSession()) && (await refreshSession())) {
          const me = await authApi.getMe();
          if (!cancelled) setUser(me);
        }
      } catch {
        // Offline / server down: fall through to the signed-out screens.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A refresh rejected mid-session (revoked, expired) drops back to login.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    return () => setSessionLostHandler(null);
  }, []);

  const signIn = useCallback(async (tokens: LoginResponse) => {
    await adoptTokens(tokens);
    try {
      setUser(await authApi.getMe());
    } catch (err) {
      await dropSession();
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    const stored = await loadSession();
    // Local state is cleared even if the revoke call fails — the user asked
    // to leave, and an unreachable server must not trap them signed in.
    try {
      if (stored) await authApi.logout(stored.sessionId);
    } catch {
      // Session expires server-side on its own TTL.
    }
    await dropSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ isLoading, user, isSignedIn: user !== null, signIn, signOut }),
    [isLoading, user, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
