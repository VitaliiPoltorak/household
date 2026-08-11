import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { financeApi } from '../api/finance';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { supportedLngs, type SupportedLng } from '@household/locales';
import { useTheme, type ThemePreference } from '../contexts/ThemeContext';

const CURRENCIES = ['UAH', 'USD', 'EUR'];
const DEFAULT_CURRENCY_KEY = 'accounts:baseCurrency';

const FLAG: Record<SupportedLng, string> = { en: '🇬🇧', uk: '🇺🇦', de: '🇩🇪', es: '🇪🇸' };
const THEME_ICON: Record<ThemePreference, string> = { light: '☀️', dark: '🌙', system: '🖥️' };
const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('settings.title')}</h1>

      <ProfileSection user={user} />
      <PreferencesSection i18n={i18n} />
      <ManageSection />
      <SecuritySection logout={logout} navigate={navigate} />
      <DangerSection user={user} logout={logout} navigate={navigate} />
    </div>
  );
}

// ──────────────────────────────────────────────
// Security section
// ──────────────────────────────────────────────
function SecuritySection({
  logout,
  navigate,
}: {
  logout: () => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleLogoutAll = async () => {
    setSigningOut(true);
    try {
      // Server invalidates every session for this user, including the one we
      // just used to make the request. Then clear local state and go to login.
      await authApi.logoutAll();
      await logout();
      navigate('/login');
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <Section title={t('settings.security')}>
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('settings.logoutAllDesc')}</p>
        {!showConfirm ? (
          <Button variant="secondary" size="sm" onClick={() => setShowConfirm(true)}>
            {t('settings.logoutAll')}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-amber-700 dark:text-amber-300">{t('settings.logoutAllWarning')}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={signingOut}
                onClick={() => setShowConfirm(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={signingOut}
                onClick={handleLogoutAll}
              >
                {signingOut ? '…' : t('settings.logoutAllConfirm')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function ManageSection() {
  const { t } = useTranslation();
  return (
    <Section title={t('settings.manage')}>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        <li>
          <Link
            to="/settings/categories"
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="text-sm text-gray-900 dark:text-gray-100">{t('categoryMgmt.title')}</span>
            <span className="text-gray-400 dark:text-gray-500" aria-hidden>›</span>
          </Link>
        </li>
      </ul>
    </Section>
  );
}

// ──────────────────────────────────────────────
// Profile section
// ──────────────────────────────────────────────
function ProfileSection({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const { t, i18n } = useTranslation();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    try {
      await authApi.updateProfile({
        displayName: displayName.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch { setStatus('idle'); }
  };

  const handleLocaleChange = async (lng: SupportedLng) => {
    await i18n.changeLanguage(lng);
    authApi.updateProfile({ locale: lng }).catch(() => null);
  };

  return (
    <Section title={t('settings.profile')}>
      <form onSubmit={save} className="space-y-4">
        <div className="mb-2 flex items-center gap-4">
          {(avatarUrl || user?.avatarUrl) ? (
            <img
              src={avatarUrl || user?.avatarUrl || ''}
              alt=""
              className="h-16 w-16 rounded-full border border-gray-200 object-cover dark:border-gray-700"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
              {(displayName || user?.displayName || '?')[0]?.toUpperCase()}
            </div>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</div>
        </div>

        <Input
          label={t('settings.displayName')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label={t('settings.avatarUrl')}
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          type="url"
        />

        {/* Language */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.language')}</label>
          <div className="flex flex-wrap gap-2">
            {supportedLngs.map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => handleLocaleChange(lng)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  i18n.resolvedLanguage === lng
                    ? 'border-primary-500 bg-primary-50 font-medium text-primary-700 dark:border-primary-500 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span>{FLAG[lng]}</span>
                <span>{t(`lang.${lng}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={status === 'saving'} size="sm">
            {status === 'saving' ? t('settings.saving') : t('common.save')}
          </Button>
          {status === 'saved' && (
            <span className="text-sm text-green-600 dark:text-green-400">✓ {t('settings.saved')}</span>
          )}
        </div>
      </form>
    </Section>
  );
}

// ──────────────────────────────────────────────
// Preferences section
// ──────────────────────────────────────────────
function PreferencesSection({ i18n: _i18n }: { i18n: ReturnType<typeof useTranslation>['i18n'] }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [currency, setCurrency] = useState(
    () => localStorage.getItem(DEFAULT_CURRENCY_KEY) ?? 'UAH',
  );

  const handleCurrencyChange = (c: string) => {
    setCurrency(c);
    localStorage.setItem(DEFAULT_CURRENCY_KEY, c);
  };

  return (
    <Section title={t('settings.preferences')}>
      <div className="space-y-4">
        {/* Theme */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.theme')}</label>
          <div className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setTheme(opt)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  theme === opt
                    ? 'border-primary-500 bg-primary-50 font-medium text-primary-700 dark:border-primary-500 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span aria-hidden>{THEME_ICON[opt]}</span>
                <span>{t(`settings.themes.${opt}`)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('settings.themeHint')}</p>
        </div>

        <Select
          label={t('settings.defaultCurrency')}
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value)}
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t('settings.defaultCurrency')} — used as base currency for multi-currency total on Accounts page.
        </p>

        <RefreshRatesRow />
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────
// Manual PrivatBank rates refresh (issue #163)
// Backend caches rates once daily; this is the escape hatch when a user
// doesn't want to wait for the next 08:00 Kyiv cron.
// ──────────────────────────────────────────────
function RefreshRatesRow() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'success'; date: string }
    | { kind: 'error'; message: string }
    | { kind: 'cooldown' } // rate-limited by server, button re-enables after 60s
  >({ kind: 'idle' });
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const startCooldown = () => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      setStatus({ kind: 'idle' });
    }, 60_000);
  };

  const handleClick = async () => {
    setStatus({ kind: 'loading' });
    try {
      const res = await financeApi.refreshRates();
      // Push the fresh rates straight into the query cache so Accounts page
      // picks them up on next visit without a second network round trip.
      queryClient.setQueryData(['exchange-rates'], res.rates);
      setStatus({ kind: 'success', date: res.date });
      startCooldown();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setStatus({ kind: 'cooldown' });
        startCooldown();
        return;
      }
      const message = err instanceof Error ? err.message : t('settings.refreshRatesError');
      setStatus({ kind: 'error', message });
      // Auto-clear the error after a few seconds so the row doesn't stay red
      // forever, but don't lock the button — user can retry immediately.
      setTimeout(() => {
        setStatus((s) => (s.kind === 'error' ? { kind: 'idle' } : s));
      }, 5000);
    }
  };

  const disabled = status.kind === 'loading' || status.kind === 'success' || status.kind === 'cooldown';

  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
      <label className="text-sm font-medium text-gray-700">
        {t('settings.refreshRates')}
      </label>
      <p className="text-xs text-gray-400">{t('settings.refreshRatesDesc')}</p>
      <div className="flex items-center gap-3 pt-1">
        <Button variant="secondary" size="sm" onClick={handleClick} disabled={disabled}>
          {status.kind === 'loading' ? t('settings.saving') : t('settings.refreshRates')}
        </Button>
        {status.kind === 'success' && (
          <span className="text-sm text-green-600">
            ✓ {t('settings.refreshRatesSuccess')}
          </span>
        )}
        {status.kind === 'cooldown' && (
          <span className="text-sm text-amber-600">
            {t('settings.refreshRatesCooldown')}
          </span>
        )}
        {status.kind === 'error' && (
          <span className="text-sm text-red-600">
            {t('settings.refreshRatesError')}
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Danger zone
// ──────────────────────────────────────────────
function DangerSection({
  user,
  logout,
  navigate,
}: {
  user: ReturnType<typeof useAuth>['user'];
  logout: () => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmEmail !== user?.email) return;
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      await logout();
      navigate('/login');
    } catch { setDeleting(false); }
  };

  return (
    <Section title={t('settings.account')}>
      <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">{t('settings.deleteWarning')}</p>

        {!showConfirm ? (
          <Button variant="danger" size="sm" onClick={() => setShowConfirm(true)}>
            {t('settings.deleteAccount')}
          </Button>
        ) : (
          <div className="space-y-3">
            <Input
              label={t('settings.confirmEmail')}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={user?.email}
              type="email"
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setShowConfirm(false); setConfirmEmail(''); }}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={confirmEmail !== user?.email || deleting}
                onClick={handleDelete}
              >
                {deleting ? '…' : t('settings.deleteAccount')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h2>
      {children}
    </div>
  );
}
