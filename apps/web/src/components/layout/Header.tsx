import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useHousehold } from '../../contexts/HouseholdContext';
import { useNavigate } from 'react-router-dom';
import { OnlineUsers } from '../presence/OnlineUsers';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MobileMenuSheet } from './MobileMenuSheet';

export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { activeHousehold } = useHousehold();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {/* Desktop bar — unchanged from before responsive nav */}
      <div className="hidden h-14 items-center justify-end gap-3 px-6 md:flex">
        <OnlineUsers />
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <ThemeToggle />
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <LanguageSwitcher />

        {user && (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {user.displayName}
            </span>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                {user.displayName[0]}
              </div>
            )}
            <button
              onClick={() => void handleLogout()}
              className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {t('auth.logout')}
            </button>
          </>
        )}
      </div>

      {/* Compact mobile bar — household name + avatar opens the menu sheet */}
      <div className="flex h-14 items-center justify-between px-4 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-gray-900 dark:text-gray-100">
            {activeHousehold?.name ?? 'Household'}
          </p>
        </div>
        {user && (
          <button
            onClick={() => setMenuOpen(true)}
            aria-label={t('nav.menu')}
            className="shrink-0"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-9 w-9 rounded-full"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                {user.displayName[0]}
              </div>
            )}
          </button>
        )}
      </div>

      {menuOpen && <MobileMenuSheet onClose={() => setMenuOpen(false)} />}
    </header>
  );
}
