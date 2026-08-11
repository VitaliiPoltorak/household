import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { MemberRole } from '../../types/api';

/**
 * Compact 1-letter role badge (Owner/Admin/Member/Viewer) with the full role
 * name in the native browser tooltip. Rendered inline with a member's display
 * name — see HouseholdPage.
 *
 * Colours are chosen so each role is visually distinct even at 20 x 20 px and
 * so the more privileged roles stand out (owner = amber, admin = blue).
 */
const ROLE_STYLES: Record<MemberRole, { letter: string; classes: string }> = {
  owner: {
    letter: 'O',
    classes:
      'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-700/60',
  },
  admin: {
    letter: 'A',
    classes:
      'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:ring-blue-700/60',
  },
  member: {
    letter: 'M',
    classes:
      'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-700/60',
  },
  viewer: {
    letter: 'V',
    classes:
      'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  },
};

export function RoleBadge({ role, className }: { role: MemberRole; className?: string }) {
  const { t } = useTranslation();
  const { letter, classes } = ROLE_STYLES[role];
  const label = t(`household.roles.${role}`);

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={clsx(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none',
        classes,
        className,
      )}
    >
      {letter}
    </span>
  );
}
