import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, cycleTheme } = useTheme();

  const icon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️';
  const title = `${t('settings.theme')}: ${t(`settings.themes.${theme}`)}`;

  return (
    <button
      onClick={cycleTheme}
      title={title}
      aria-label={title}
      className="rounded-md px-1.5 py-0.5 text-base opacity-70 transition-opacity hover:opacity-100"
    >
      {icon}
    </button>
  );
}
