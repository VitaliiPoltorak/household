import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { OnlineUsers } from '../presence/OnlineUsers';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-900">
      {/* Online users */}
      <OnlineUsers />
      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
      {/* Theme toggle */}
      <ThemeToggle />
      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
      {/* Language switcher */}
      <LanguageSwitcher />

      {user && (
        <>
          <span className="text-sm text-gray-600 dark:text-gray-300">{user.displayName}</span>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              {user.displayName[0]}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('auth.logout')}
          </button>
        </>
      )}
    </header>
  );
}
