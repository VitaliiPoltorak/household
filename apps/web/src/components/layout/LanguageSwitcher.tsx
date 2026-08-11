import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLngs, type SupportedLng } from '@household/locales';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/auth';

const FLAG: Record<SupportedLng, string> = { en: '🇬🇧', uk: '🇺🇦', de: '🇩🇪', es: '🇪🇸' };

/**
 * Collapsed language switcher: single flag button that opens a dropdown
 * with all supported languages. Follows the same visual weight as ThemeToggle
 * (opacity-70 hover-to-100).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = (i18n.resolvedLanguage as SupportedLng) ?? 'en';
  const currentFlag = FLAG[current] ?? FLAG.en;

  // Outside click + Escape close.
  useEffect(() => {
    if (!open) return;
    const handleMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouse);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouse);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleSelect = async (lng: SupportedLng) => {
    setOpen(false);
    await i18n.changeLanguage(lng);
    // Persist to user profile if logged in
    if (user) authApi.updateProfile({ locale: lng }).catch(() => null);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(`lang.${current}`)}
        title={t(`lang.${current}`)}
        className="flex h-8 w-8 items-center justify-center rounded text-base opacity-70 transition-opacity hover:opacity-100"
      >
        {currentFlag}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {supportedLngs.map((lng) => {
            const active = current === lng;
            return (
              <button
                key={lng}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleSelect(lng)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? 'bg-gray-50 font-medium text-gray-900 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{FLAG[lng]}</span>
                  <span>{t(`lang.${lng}`)}</span>
                </span>
                {active && (
                  <span aria-hidden="true" className="text-primary-600 dark:text-primary-500">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
