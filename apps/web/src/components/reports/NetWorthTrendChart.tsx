import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrendPoint } from '../../lib/net-worth-trend';

const MAX_TOOLTIP_TRANSACTIONS = 5;

interface Props {
  data: TrendPoint[];
  formatValue: (n: number) => string;
  width?: number;
  height?: number;
}

/**
 * Small zero-dependency SVG line chart for a single currency's net-worth
 * history (#379) — same "no charting library" approach as DonutChart.
 *
 * Two kinds of points share one line (#379 follow-up): 'snapshot' (a
 * persisted checkpoint, or the live "today" total) renders larger/solid;
 * 'activity' (interpolated purely from that day's transactions, merged into
 * one point per day) renders smaller/lighter. Both can carry a same-day
 * transaction list, shown in the hover tooltip.
 */
export function NetWorthTrendChart({
  data,
  formatValue,
  width = 560,
  height = 140,
}: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);
  const padding = 20;

  const points = useMemo(() => {
    if (data.length === 0) return [];
    const values = data.map((d) => d.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      // A flat series would otherwise divide by zero — spread the range so
      // a single flat line still renders instead of collapsing to NaN.
      min -= 1;
      max += 1;
    }
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    return data.map((d, i) => ({
      x:
        data.length === 1
          ? padding + innerW / 2
          : padding + (i / (data.length - 1)) * innerW,
      y: padding + innerH - ((d.value - min) / (max - min)) * innerH,
    }));
  }, [data, width, height]);

  if (data.length === 0) return null;

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const formatSigned = (n: number) => `${n >= 0 ? '+' : ''}${formatValue(n)}`;

  const sourceLabel = (source: TrendPoint['source']) => {
    if (source === 'auto') return t('netWorthHistory.auto');
    if (source === 'manual') return t('netWorthHistory.manual');
    if (source === 'live') return t('netWorthHistory.trendLive');
    return null;
  };

  return (
    <div className="relative">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        onMouseLeave={() => setHovered(null)}
      >
        <path
          d={path}
          fill="none"
          strokeWidth={2}
          className="stroke-blue-500 dark:stroke-blue-400"
        />
        {points.map((p, i) => {
          const isSnapshot = data[i].kind === 'snapshot';
          const isHovered = hovered === i;
          return (
            <circle
              key={data[i].date}
              cx={p.x}
              cy={p.y}
              r={isSnapshot ? (isHovered ? 5 : 4) : isHovered ? 4 : 2.5}
              className={`fill-blue-500 dark:fill-blue-400 ${isSnapshot ? '' : 'opacity-55'}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)}
            />
          );
        })}
      </svg>
      {hovered !== null &&
        (() => {
          const d = data[hovered];
          const p = points[hovered];
          const label = sourceLabel(d.source);
          const shown = d.transactions?.slice(0, MAX_TOOLTIP_TRANSACTIONS);
          const hiddenCount = d.transactions
            ? d.transactions.length - (shown?.length ?? 0)
            : 0;
          return (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
              style={{
                left: `${(p.x / width) * 100}%`,
                top: `${(p.y / height) * 100}%`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-800 dark:text-gray-100">
                  {d.date}
                </span>
                {label && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {label}
                  </span>
                )}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {formatValue(d.value)}
              </div>
              {d.transactions && d.transactions.length > 0 && (
                <div className="mt-1 border-t border-gray-100 pt-1 dark:border-gray-700">
                  <div className="text-gray-500 dark:text-gray-400">
                    {t('netWorthHistory.trendChange')}:{' '}
                    <span
                      className={
                        (d.delta ?? 0) >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {formatSigned(d.delta ?? 0)}
                    </span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {shown!.map((tx) => (
                      <li
                        key={tx.id}
                        className="flex items-center gap-2 text-gray-600 dark:text-gray-300"
                      >
                        <span className="max-w-[160px] truncate">
                          {tx.description ||
                            t(`transactions.types.${tx.type}` as never)}
                        </span>
                        <span
                          className={
                            tx.amount >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {formatSigned(tx.amount)}
                        </span>
                      </li>
                    ))}
                    {hiddenCount > 0 && (
                      <li className="text-gray-400 dark:text-gray-500">
                        {t('netWorthHistory.trendMore', { count: hiddenCount })}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
