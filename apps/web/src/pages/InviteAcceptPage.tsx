import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../api/client';
import { setReturnTo } from '../lib/auth-redirect';
import { useAcceptInvite } from '../hooks/useAcceptInvite';

type Status =
  | 'checking-auth'
  | 'needs-auth'
  | 'accepting'
  | 'success'
  | 'error';

const REDIRECT_DELAY_MS = 1500;

/**
 * Landing page for the invite link copied by InviteModal
 * (`/invite?token=<uuid>`, apps/web/src/pages/HouseholdPage.tsx). Handles
 * both an already-authenticated visitor (accept immediately) and a brand
 * new one (stash the token via auth-redirect's return_to, send them to
 * log in / register, land back here once authenticated).
 */
export function InviteAcceptPage() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const acceptInvite = useAcceptInvite();
  const [params] = useSearchParams();
  const token = params.get('token');
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>('checking-auth');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setStatus('error');
      setErrorStatus(null);
      return;
    }

    if (!user) {
      setReturnTo(`${location.pathname}${location.search}`);
      setStatus('needs-auth');
      return;
    }

    if (attemptedRef.current) return;
    attemptedRef.current = true;
    setStatus('accepting');

    acceptInvite(token)
      .then(() => {
        setStatus('success');
        setTimeout(
          () => navigate('/household', { replace: true }),
          REDIRECT_DELAY_MS,
        );
      })
      .catch((err: unknown) => {
        setStatus('error');
        setErrorStatus(err instanceof ApiError ? err.status : null);
      });
    // location.pathname/search are read once to build the return-to path and
    // don't need to re-trigger this effect on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token, acceptInvite]);

  const errorMessage = () => {
    switch (errorStatus) {
      case 403:
        return t('household.acceptInvite.error.emailMismatch');
      case 404:
        return t('household.acceptInvite.error.invalid');
      case 409:
        return t('household.acceptInvite.error.conflict');
      default:
        return t('household.acceptInvite.error.generic');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-900 dark:shadow-black/40">
        <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('household.acceptInvite.title')}
        </h1>

        {(status === 'checking-auth' || status === 'accepting') && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('household.acceptInvite.checking')}
          </p>
        )}

        {status === 'needs-auth' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('household.acceptInvite.needsAuth')}
            </p>
            <div className="flex gap-2">
              <Link
                to="/login"
                className="flex-1 rounded-md bg-primary-600 px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
              >
                {t('auth.signIn')}
              </Link>
              <Link
                to="/register"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t('auth.signUp')}
              </Link>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div
            role="status"
            className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300"
          >
            {t('household.acceptInvite.success')}
          </div>
        )}

        {status === 'error' && (
          <div
            role="alert"
            className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {errorMessage()}
          </div>
        )}

        <div className="mt-6 text-center text-sm">
          <Link
            to="/login"
            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
