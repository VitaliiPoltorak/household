import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { usePrimaryNav } from './primaryNav';

/**
 * Bottom tab bar shown in place of the Sidebar below the `md` breakpoint —
 * same five destinations as Sidebar's primary nav (usePrimaryNav), just a
 * different chrome. Fixed to the viewport bottom; Layout reserves matching
 * space at the foot of <main> so content never renders underneath it.
 */
export function MobileTabBar() {
  const NAV = usePrimaryNav();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-gray-200 bg-white pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 dark:border-gray-800 dark:bg-gray-900 md:hidden"
      aria-label="Primary"
    >
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px]',
              isActive
                ? 'font-bold text-primary-600 dark:text-primary-300'
                : 'font-medium text-gray-400 dark:text-gray-500',
            )
          }
        >
          <Icon className="h-[22px] w-[22px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
