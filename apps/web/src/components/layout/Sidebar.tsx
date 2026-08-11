import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useHousehold } from '../../contexts/HouseholdContext';

export function Sidebar() {
  const { t } = useTranslation();
  const { households, activeHousehold, setActiveHousehold } = useHousehold();

  const NAV = [
    { to: '/dashboard',    label: t('nav.dashboard') },
    { to: '/accounts',     label: t('nav.accounts') },
    { to: '/transactions', label: t('nav.transactions') },
    { to: '/shopping',     label: t('nav.shopping') },
    { to: '/household',    label: t('nav.household') },
  ];

  const BOTTOM_NAV = [
    { to: '/settings', label: t('nav.settings') },
  ];

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-14 items-center border-b border-gray-200 px-4 dark:border-gray-800">
        <span className="text-lg font-bold text-primary-600 dark:text-primary-400">Household</span>
      </div>

      {households.length > 1 && (
        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <select
            value={activeHousehold?.id ?? ''}
            onChange={(e) => {
              const h = households.find((x) => x.id === e.target.value);
              if (h) setActiveHousehold(h);
            }}
            className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
      )}

      {activeHousehold && households.length === 1 && (
        <div className="border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('nav.household')}</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">{activeHousehold.name}</p>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: settings */}
      <div className="border-t border-gray-200 px-2 py-2 dark:border-gray-800">
        {BOTTOM_NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
              )
            }
          >
            ⚙️ {label}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
