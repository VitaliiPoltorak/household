import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleLogin } from '@react-oauth/google';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { authApi } from '../api/auth';
import { loginSchema, type LoginFormValues } from '../lib/auth-schemas';
import { mapAuthError } from '../lib/auth-errors';
import { td } from '../lib/i18n-dynamic';
import { Logo } from '../components/brand/Logo';
import { consumeReturnTo } from '../lib/auth-redirect';
import { rememberPendingVerificationEmail } from '../lib/pending-verification';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const { resolved } = useTheme();
  const navigate = useNavigate();
  const [globalError, setGlobalError] = useState('');

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const redirectAfterLogin = () => {
    navigate(consumeReturnTo(), { replace: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setGlobalError('');
    try {
      const tokens = await authApi.loginWithPassword({
        email: values.email,
        password: values.password,
      });
      await login(tokens);
      redirectAfterLogin();
    } catch (err) {
      const mapped = mapAuthError(err);
      // EMAIL_NOT_VERIFIED → send the user straight to the verify screen,
      // carrying the email over so they don't retype it.
      if (mapped.code === 'EMAIL_NOT_VERIFIED') {
        const pending = mapped.email ?? values.email;
        // Persisted too, so reloading /verify-email keeps the address (#320).
        rememberPendingVerificationEmail(pending);
        navigate('/verify-email', {
          replace: true,
          state: { email: pending },
        });
        return;
      }
      setGlobalError(td(t, mapped.key));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-900 dark:shadow-black/40">
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-3 h-9 w-9 text-primary-600 dark:text-primary-300" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('auth.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('auth.subtitle')}
          </p>
        </div>

        {globalError && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {globalError}
          </div>
        )}

        <div className="mb-6 flex justify-center">
          <GoogleLogin
            onSuccess={async (cred) => {
              if (!cred.credential) return;
              try {
                setGlobalError('');
                const tokens = await authApi.loginWithGoogle(cred.credential);
                await login(tokens);
                redirectAfterLogin();
              } catch {
                setGlobalError(t('auth.loginError'));
              }
            }}
            onError={() => setGlobalError(t('auth.loginError'))}
            width="280"
            theme={resolved === 'dark' ? 'filled_black' : 'outline'}
          />
        </div>

        <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span>{t('auth.orDivider')}</span>
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              {t('auth.email')}
            </span>
            <input
              type="email"
              autoComplete="email"
              {...form.register('email')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
            {form.formState.errors.email && (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
                {form.formState.errors.email.message}
              </span>
            )}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              {t('auth.password')}
            </span>
            <input
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
          >
            {form.formState.isSubmitting
              ? t('auth.signingIn')
              : t('auth.signIn')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('auth.noAccount')}{' '}
          <Link
            to="/register"
            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </div>
  );
}
