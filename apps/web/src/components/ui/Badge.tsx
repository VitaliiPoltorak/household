import clsx from 'clsx';

const colors: Record<string, string> = {
  income: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  expense: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  transfer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  adjustment: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  cash: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  bank: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  crypto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  investment: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  deposit: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
};

const DEFAULT = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';

export function Badge({ label }: { label: string }) {
  return (
    <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', colors[label] ?? DEFAULT)}>
      {label}
    </span>
  );
}
