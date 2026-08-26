// Single source of truth for "how does this app render a date" (#275).
// localStorage-only, same client-side-preference pattern as ThemeContext —
// no cross-device requirement was asked for, so no server persistence.

export type DateFormatPreference =
  | 'auto'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD';

export const DATE_FORMAT_OPTIONS: DateFormatPreference[] = [
  'auto',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
];

const STORAGE_KEY = 'dateFormat';

export function getDateFormatPreference(): DateFormatPreference {
  const raw =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  return (DATE_FORMAT_OPTIONS as string[]).includes(raw ?? '')
    ? (raw as DateFormatPreference)
    : 'auto';
}

export function setDateFormatPreference(pref: DateFormatPreference): void {
  localStorage.setItem(STORAGE_KEY, pref);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// The one place every page should go through instead of calling
// toLocaleDateString()/toLocaleString() directly, so the rendered format is
// a user choice rather than whatever the visitor's OS/browser locale
// happens to be. 'auto' explicitly keeps that old behavior as the default.
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const pref = getDateFormatPreference();
  if (pref === 'auto') return d.toLocaleDateString();

  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  if (pref === 'DD/MM/YYYY') return `${day}/${month}/${year}`;
  if (pref === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
  return `${year}-${month}-${day}`;
}
