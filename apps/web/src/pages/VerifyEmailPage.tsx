import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { verifyEmailSchema, type VerifyEmailFormValues } from '../lib/auth-schemas';
import { mapAuthError, type MappedAuthError } from '../lib/auth-errors';
import { td } from '../lib/i18n-dynamic';

const RESEND_COOLDOWN_SEC = 30;

interface LocationState {
  email?: string;
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as LocationState | null)?.email ?? '';

  const [globalError, setGlobalError] = useState<MappedAuthError | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);
  const autoSubmittedRef = useRef(false);

  const form = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { code: '' },
  });

  // If the user arrived at /verify-email without an email (e.g. deep-link or
  // page refresh that dropped the nav state), send them back to register.
  useEffect(() => {
    if (!email) navigate('/register', { replace: true });
  }, [email, navigate]);

  // Already signed in? Bounce to the dashboard. Runs as an effect so we don't
  // early-return between hooks (would violate the Rules of Hooks with the
  // auto-submit effect further down).
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  // Cooldown ticker — no dep on resendCooldown itself; the interval self-
  // stops when it hits 0.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const submit = form.handleSubmit(async (values) => {
    setGlobalError(null);
    setResendSuccess(false);
    try {
      const tokens = await authApi.verifyEmail({ email, code: values.code });
      // Server returned a full LoginResponse — the fresh cookies are already
      // set on this response, and login() will pick up /auth/me + hydrate
      // AuthContext.
      await login(tokens);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const mapped = mapAuthError(err);
      setGlobalError(mapped);
      // Wrong code / exhausted / expired — clear the field so the user
      // doesn't have to select-and-delete before retrying / requesting new.
      form.reset({ code: '' });
    }
  });

  // Auto-submit as soon as we have all 6 digits — same UX as SMS-code inputs
  // in most mobile apps. Ref guard prevents re-firing while the previous
  // submit is still in flight.
  const codeValue = form.watch('code');
  useEffect(() => {
    if (
      codeValue &&
      codeValue.length === 6 &&
      /^\d{6}$/.test(codeValue) &&
      !form.formState.isSubmitting &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      void submit();
    }
    if (codeValue.length < 6) {
      autoSubmittedRef.current = false;
    }
  }, [codeValue, form.formState.isSubmitting, submit]);

  const onResend = async () => {
    if (resendCooldown > 0) return;
    setGlobalError(null);
    setResendSuccess(false);
    try {
      await authApi.resendVerification(email);
      setResendSuccess(true);
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setGlobalError(mapAuthError(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-900 dark:shadow-black/40">
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('auth.verifyEmail.title')}
        </h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {t('auth.verifyEmail.body', { email })}
        </p>

        {globalError && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            <p>{td(t, globalError.key)}</p>
            {typeof globalError.attemptsRemaining === 'number' && (
              <p className="mt-1 text-xs opacity-90">
                {t('auth.verifyEmail.attemptsLeft', { count: globalError.attemptsRemaining })}
              </p>
            )}
          </div>
        )}

        {resendSuccess && (
          <div
            role="status"
            className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300"
          >
            {t('auth.verifyEmail.resendSent')}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3" noValidate>
          <label htmlFor="code" className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              {t('auth.code')}
            </span>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              {...form.register('code')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-widest text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
            {form.formState.errors.code?.message && (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
                {td(t, form.formState.errors.code.message)}
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {form.formState.isSubmitting ? t('auth.verifying') : t('auth.verify')}
          </button>
        </form>

        <button
          type="button"
          onClick={onResend}
          disabled={resendCooldown > 0}
          className="mt-4 w-full text-center text-sm text-blue-600 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60 dark:text-blue-400"
        >
          {resendCooldown > 0
            ? t('auth.verifyEmail.resendCooldown', { seconds: resendCooldown })
            : t('auth.verifyEmail.resend')}
        </button>

        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="text-gray-500 hover:underline dark:text-gray-400">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
