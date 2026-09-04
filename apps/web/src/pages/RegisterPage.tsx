import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { registerSchema, type RegisterFormValues } from '../lib/auth-schemas';
import { mapAuthError, type MappedAuthError } from '../lib/auth-errors';
import { td } from '../lib/i18n-dynamic';
import { rememberPendingVerificationEmail } from '../lib/pending-verification';

export function RegisterPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [globalError, setGlobalError] = useState<MappedAuthError | null>(null);
  // Set when registration failed with 409 — drives the "finish verifying"
  // recovery link below.
  const [stuckEmail, setStuckEmail] = useState('');

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', displayName: '', password: '' },
  });

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const onSubmit = form.handleSubmit(async (values) => {
    setGlobalError(null);
    try {
      const res = await authApi.register(values);
      // No access token on 202 — bounce to the verify screen with the
      // server-normalised email in nav state so we don't ask the user to
      // retype it. Also persisted, so a reload of /verify-email doesn't lose
      // it (#320).
      rememberPendingVerificationEmail(res.email);
      navigate('/verify-email', {
        replace: true,
        state: { email: res.email },
      });
    } catch (err) {
      const mapped = mapAuthError(err);
      setGlobalError(mapped);
      // 409 means the row exists — but it may well be *this* user's own
      // half-finished signup, and /register can never move them forward.
      // Offer the verify screen as the way out. The address was typed into
      // this form, and the 409 already told the user it is taken, so the
      // link discloses nothing further.
      setStuckEmail(mapped.key === 'auth.errors.emailTaken' ? values.email : '');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-900 dark:shadow-black/40">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('auth.createAccount')}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('auth.subtitle')}</p>
        </div>

        {globalError && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            <p>{td(t, globalError.key)}</p>
            {globalError.suggestions && globalError.suggestions.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs opacity-90">
                {globalError.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {stuckEmail && (
              <p className="mt-2 text-xs">
                <Link
                  to="/verify-email"
                  state={{ email: stuckEmail }}
                  className="font-medium underline"
                >
                  {t('auth.verifyEmail.finishVerifying')}
                </Link>
              </p>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <Field
            id="email"
            type="email"
            autoComplete="email"
            label={t('auth.email')}
            register={form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <Field
            id="displayName"
            type="text"
            autoComplete="name"
            label={t('auth.displayName')}
            register={form.register('displayName')}
            error={form.formState.errors.displayName?.message}
          />
          <Field
            id="password"
            type="password"
            autoComplete="new-password"
            label={t('auth.password')}
            register={form.register('password')}
            error={
              form.formState.errors.password?.message
                ? td(t, form.formState.errors.password.message)
                : undefined
            }
          />

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
          >
            {form.formState.isSubmitting ? t('auth.creatingAccount') : t('auth.createAccount')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}

// Small inline field wrapper — kept local to this file so we don't grow a
// generic <Input/> component API before we have real cross-page reuse.
function Field(props: {
  id: string;
  type: string;
  autoComplete: string;
  label: string;
  register: ReturnType<ReturnType<typeof useForm<RegisterFormValues>>['register']>;
  error?: string;
}) {
  return (
    <label className="block text-sm" htmlFor={props.id}>
      <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">{props.label}</span>
      <input
        id={props.id}
        type={props.type}
        autoComplete={props.autoComplete}
        {...props.register}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
      />
      {props.error && (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{props.error}</span>
      )}
    </label>
  );
}
