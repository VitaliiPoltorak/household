import clsx from 'clsx';
import { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const variants = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-600 dark:hover:bg-primary-500',
  secondary:
    'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500',
  ghost:
    'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-800',
};
const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm' };

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: Props) {
  return (
    <button
      {...props}
      className={clsx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors', variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}
