import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readStored(): ThemePreference {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

function applyToDocument(resolved: ResolvedTheme): void {
  const el = document.documentElement;
  if (resolved === 'dark') el.classList.add('dark');
  else el.classList.remove('dark');
}

interface ThemeContextValue {
  theme: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStored());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStored()));

  useEffect(() => {
    const next = resolveTheme(theme);
    setResolved(next);
    applyToDocument(next);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Track OS-level theme changes only while the user has picked 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    // jsdom (tests) doesn't provide matchMedia — safe to skip: fixed 'system'
    // will just remain at its initial resolved value with no live tracking.
    const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    if (!mq) return;
    const handler = () => {
      const next: ResolvedTheme = mq.matches ? 'dark' : 'light';
      setResolved(next);
      applyToDocument(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: ThemePreference) => setThemeState(t), []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved, setTheme, cycleTheme }),
    [theme, resolved, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
