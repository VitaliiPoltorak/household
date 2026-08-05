import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useHousehold } from '../../contexts/HouseholdContext';

const NAV = [
  { to: '/dashboard', label: '🏠 Dashboard' },
  { to: '/accounts', label: '💳 Accounts' },
  { to: '/transactions', label: '↕️ Transactions' },
  { to: '/shopping', label: '🛒 Shopping' },
  { to: '/household', label: '👥 Household' },
];

export function Sidebar() {
  const { households, activeHousehold, setActiveHousehold } = useHousehold();

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <span className="text-lg font-bold text-primary-600">Household</span>
      </div>

      {/* Household switcher */}
      {households.length > 1 && (
        <div className="border-b border-gray-200 px-3 py-2">
          <select
            value={activeHousehold?.id ?? ''}
            onChange={(e) => {
              const h = households.find((x) => x.id === e.target.value);
              if (h) setActiveHousehold(h);
            }}
            className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm"
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
      )}

      {activeHousehold && households.length === 1 && (
        <div className="border-b border-gray-200 px-4 py-2.5">
          <p className="text-xs text-gray-500">Home</p>
          <p className="font-medium text-gray-800">{activeHousehold.name}</p>
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
                  ? 'bg-primary-50 font-medium text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
