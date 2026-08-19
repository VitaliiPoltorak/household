import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { mapAuthError, type MappedAuthError } from '../lib/auth-errors';
import { td } from '../lib/i18n-dynamic';

type Status = 'idle' | 'in-flight' | 'success' | 'error';

/**
 * Landing page for the account-locked email link (POST /auth/unlock).
 *
 * The unlock token comes in via the `?token=<64-hex>` query param. We hit
 * the endpoint once on mount and switch to a terminal status — no retry
 * loop, no user input needed. Failure branches show the error and route
 * back to /login.
 */
export function UnlockAccountPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<MappedAuthError | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError({ key: 'auth.unlock.missingToken' });
      return;
    }
    let cancelled = false;
    setStatus('in-flight');
    authApi
      .unlockAccount(token)
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setError(mapAuthError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-900 dark:shadow-black/40">
        <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('auth.unlock.title')}
        </h1>

        {(status === 'idle' || status === 'in-flight') && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('auth.unlock.checking')}</p>
        )}

        {status === 'success' && (
          <div
            role="status"
            className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300"
          >
            {t('auth.unlock.success')}
          </div>
        )}

        {status === 'error' && error && (
          <div
            role="alert"
            className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {td(t, error.key)}
          </div>
        )}

        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
