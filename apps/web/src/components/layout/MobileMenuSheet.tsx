import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { InviteIcon, SettingsIcon } from '../brand/icons';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Mobile-only "account menu" bottom sheet — everything Header keeps in its
 * desktop row (presence, theme, language, logout) plus the two secondary
 * nav destinations Sidebar puts below the divider (Invites, Settings), all
 * reached from the compact mobile header's avatar button.
 */
export function MobileMenuSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white pb-[max(env(safe-area-inset-bottom),20px)] shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />

        {user && (
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-11 w-11 rounded-full"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                {user.displayName[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                {user.displayName}
              </p>
              <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                {user.email}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col px-2 py-1">
          <button
            onClick={() => go('/invites')}
            className="flex items-center gap-3.5 border-b border-gray-100 px-3 py-3.5 text-left dark:border-gray-800"
          >
            <InviteIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1 text-[14.5px] font-medium text-gray-900 dark:text-gray-100">
              {t('nav.invites')}
            </span>
          </button>
          <button
            onClick={() => go('/settings')}
            className="flex items-center gap-3.5 border-b border-gray-100 px-3 py-3.5 text-left dark:border-gray-800"
          >
            <SettingsIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1 text-[14.5px] font-medium text-gray-900 dark:text-gray-100">
              {t('nav.settings')}
            </span>
          </button>

          <div className="flex items-center justify-between px-3 py-3.5">
            <span className="text-[14.5px] font-medium text-gray-900 dark:text-gray-100">
              {t('settings.theme')}
            </span>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
              <LanguageSwitcher />
            </div>
          </div>
        </div>

        <div className="px-5 pb-1 pt-2">
          <button
            onClick={() => void handleLogout()}
            className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
          >
            {t('auth.logout')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
