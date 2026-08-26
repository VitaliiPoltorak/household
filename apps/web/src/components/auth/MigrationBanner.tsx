import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { setReturnTo } from '../../lib/auth-redirect';

const LEGACY_KEYS = ['accessToken', 'refreshToken', 'sessionId'] as const;

/**
 * Gate rendered under AuthProvider. When the user has legacy pre-#60
 * localStorage tokens, we hide the app behind an explicit "please sign in
 * again" screen instead of trying to migrate silently. Alternative was a
 * transitional dual-mode refresh path on the backend — more code and
 * moving parts than this two-step UX.
 *
 * When migration is not needed, children render normally.
 */
export function MigrationBanner({ children }: { children: ReactNode }) {
  const { migrationNeeded } = useAuth();
  const { t } = useTranslation();

  if (!migrationNeeded) return <>{children}</>;

  const handleReAuth = () => {
    // Save whatever URL the user was trying to reach so LoginPage can send
    // them back after OAuth completes.
    if (window.location.pathname !== '/login') {
      setReturnTo(window.location.pathname + window.location.search);
    }
    // Clear legacy tokens FIRST so the reload doesn't loop the banner.
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
    // Hard nav — MigrationBanner lives outside RouterProvider so we can't
    // use React Router's navigate. Full reload also gives us a clean mount
    // of AuthProvider with the legacy check now returning false.
    window.location.href = '/login';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 dark:bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900">
        <div className="mb-6 flex justify-center text-4xl">🔒</div>
        <h2 className="mb-3 text-center text-xl font-bold text-gray-900 dark:text-gray-100">
          {t('auth.migration.title')}
        </h2>
        <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-300">
          {t('auth.migration.body')}
        </p>
        <button
          type="button"
          onClick={handleReAuth}
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500"
        >
          {t('auth.migration.cta')}
        </button>
      </div>
    </div>
  );
}
