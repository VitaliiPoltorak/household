interface IconProps {
  className?: string;
}

const shared = {
  fill: 'none' as const,
  stroke: 'currentColor' as const,
  strokeWidth: 2,
};

/** Sidebar nav icon: dashboard. */
export function HomeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.8 11.2L12 4.6l8.2 6.6M6.6 10.4v9h10.8v-9" />
    </svg>
  );
}

/** Sidebar nav icon: accounts. */
export function BillIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M3.5 10.5h17M7.5 15h4" />
    </svg>
  );
}

/** Sidebar nav icon: transactions. */
export function TxIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9h13M14 6l3 3-3 3M20 15H7M10 12l-3 3 3 3" />
    </svg>
  );
}

/** Categories icon. */
export function CategoryIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinejoin="round"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect
        x="13.5"
        y="3.5"
        width="7"
        height="7"
        rx="1.5"
        fill="currentColor"
      />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** Sidebar nav icon: shopping. */
export function ListIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6.5h11M9 12h11M9 17.5h7M3.5 6.5l1.5 1.5 3-3.2M4 12h1M4 17.5h1" />
    </svg>
  );
}

/** Budget icon. */
export function BudgetIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="8.2" opacity="0.35" />
      <path d="M12 3.8a8.2 8.2 0 0 1 8.2 8.2" />
    </svg>
  );
}

/** Sidebar nav icon: household / members. */
export function MembersIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9.5" cy="8.5" r="3.4" />
      <circle cx="17" cy="10" r="2.4" opacity="0.5" />
      <path d="M3.5 19.5c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" />
    </svg>
  );
}

/** Recurring payments icon. */
export function RecurringIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 12a8 8 0 1 1-2.9-6.2M20.2 4v4.2h-4.2" />
    </svg>
  );
}

/** Sidebar nav icon: settings (gear built from the icon set's geometry, replaces the ⚙️ emoji). */
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...shared}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.8v2.6M12 17.6v2.6M20.2 12h-2.6M6.4 12H3.8M17.5 6.5l-1.8 1.8M8.3 15.7l-1.8 1.8M17.5 17.5l-1.8-1.8M8.3 8.3 6.5 6.5" />
    </svg>
  );
}
