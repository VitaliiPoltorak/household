interface Props {
  label: string;
  value: string;
  color: 'primary' | 'green' | 'red';
  /** Optional small caption below the value — e.g. "converted from 3 currencies". */
  subtitle?: string | null;
}

const COLORS: Record<Props['color'], string> = {
  primary:
    'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200',
  green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
};

/** Coloured summary card shown on the dashboard. */
export function StatCard({ label, value, color, subtitle }: Props) {
  return (
    <div className={`rounded-xl p-5 ${COLORS[color]}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-xs opacity-70">{subtitle}</p>}
    </div>
  );
}
