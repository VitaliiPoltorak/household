interface Props {
  label: string;
  value: string;
  color: 'blue' | 'green' | 'red';
}

const COLORS: Record<Props['color'], string> = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
  green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
};

/** Coloured summary card shown on the dashboard. */
export function StatCard({ label, value, color }: Props) {
  return (
    <div className={`rounded-xl p-5 ${COLORS[color]}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
