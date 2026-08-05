import clsx from 'clsx';

const colors: Record<string, string> = {
  income: 'bg-green-100 text-green-700',
  expense: 'bg-red-100 text-red-700',
  transfer: 'bg-blue-100 text-blue-700',
  adjustment: 'bg-gray-100 text-gray-600',
  cash: 'bg-yellow-100 text-yellow-700',
  bank: 'bg-blue-100 text-blue-700',
  crypto: 'bg-purple-100 text-purple-700',
  investment: 'bg-indigo-100 text-indigo-700',
  deposit: 'bg-teal-100 text-teal-700',
};

export function Badge({ label }: { label: string }) {
  return (
    <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', colors[label] ?? 'bg-gray-100 text-gray-600')}>
      {label}
    </span>
  );
}
