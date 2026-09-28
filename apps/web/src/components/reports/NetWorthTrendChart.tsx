import { useMemo, useState } from 'react';

export interface TrendPoint {
  date: string;
  value: number;
}

interface Props {
  data: TrendPoint[];
  formatValue: (n: number) => string;
  width?: number;
  height?: number;
}

/**
 * Small zero-dependency SVG line chart for a single currency's net-worth
 * history (#379) — same "no charting library" approach as DonutChart.
 */
export function NetWorthTrendChart({
  data,
  formatValue,
  width = 560,
  height = 140,
}: Props) {
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
        {points.map((p, i) => (
          <circle
            key={data[i].date}
            cx={p.x}
            cy={p.y}
            r={hovered === i ? 4 : 3}
            className="fill-blue-500 dark:fill-blue-400"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHovered(i)}
          />
        ))}
      </svg>
      {hovered !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
          style={{
            left: `${(points[hovered].x / width) * 100}%`,
            top: `${(points[hovered].y / height) * 100}%`,
          }}
        >
          <div className="font-medium text-gray-800 dark:text-gray-100">
            {data[hovered].date}
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            {formatValue(data[hovered].value)}
          </div>
        </div>
      )}
    </div>
  );
}
