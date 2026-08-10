import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { supportedLngs, type SupportedLng } from '@household/locales';

const CURRENCIES = ['UAH', 'USD', 'EUR'];
const DEFAULT_CURRENCY_KEY = 'accounts:baseCurrency';

const FLAG: Record<SupportedLng, string> = { en: '🇬🇧', uk: '🇺🇦', de: '🇩🇪', es: '🇪🇸' };

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>

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
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm text-gray-600">{t('settings.logoutAllDesc')}</p>
        {!showConfirm ? (
          <Button variant="secondary" size="sm" onClick={() => setShowConfirm(true)}>
            {t('settings.logoutAll')}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-amber-700">{t('settings.logoutAllWarning')}</p>
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
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        <li>
          <Link
            to="/settings/categories"
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
          >
            <span className="text-sm text-gray-900">{t('categoryMgmt.title')}</span>
            <span className="text-gray-400" aria-hidden>›</span>
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
        <div className="flex items-center gap-4 mb-2">
          {(avatarUrl || user?.avatarUrl) ? (
            <img
              src={avatarUrl || user?.avatarUrl || ''}
              alt=""
              className="h-16 w-16 rounded-full object-cover border border-gray-200"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-600">
              {(displayName || user?.displayName || '?')[0]?.toUpperCase()}
            </div>
          )}
          <div className="text-sm text-gray-500">{user?.email}</div>
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
          <label className="text-sm font-medium text-gray-700">{t('settings.language')}</label>
          <div className="flex gap-2 flex-wrap">
            {supportedLngs.map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => handleLocaleChange(lng)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  i18n.resolvedLanguage === lng
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
            <span className="text-sm text-green-600">✓ {t('settings.saved')}</span>
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
        <Select
          label={t('settings.defaultCurrency')}
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value)}
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <p className="text-xs text-gray-400">
          {t('settings.defaultCurrency')} — used as base currency for multi-currency total on Accounts page.
        </p>
      </div>
    </Section>
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
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
        <p className="text-sm text-red-700">{t('settings.deleteWarning')}</p>

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
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}
