import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/auth';
import { useNavigate } from 'react-router-dom';
import { supportedLngs, type SupportedLng } from '@household/locales';

const FLAG: Record<SupportedLng, string> = { en: '🇬🇧', uk: '🇺🇦', de: '🇩🇪', es: '🇪🇸' };

export function Header() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleLangChange = async (lng: SupportedLng) => {
    await i18n.changeLanguage(lng);
    // Persist to user profile if logged in
    if (user) authApi.updateProfile({ locale: lng }).catch(() => null);
  };

  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b border-gray-200 bg-white px-6">
      {/* Language switcher */}
      <div className="flex items-center gap-1">
        {supportedLngs.map((lng) => (
          <button
            key={lng}
            onClick={() => handleLangChange(lng)}
            title={t(`lang.${lng}`)}
            className={`rounded px-1.5 py-0.5 text-base transition-opacity ${
              i18n.resolvedLanguage === lng ? 'opacity-100' : 'opacity-30 hover:opacity-60'
            }`}
          >
            {FLAG[lng]}
          </button>
        ))}
      </div>

      {user && (
        <>
          <span className="text-sm text-gray-600">{user.displayName}</span>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              {user.displayName[0]}
            </div>
          )}
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-800">
            {t('auth.logout')}
          </button>
        </>
      )}
    </header>
  );
}
