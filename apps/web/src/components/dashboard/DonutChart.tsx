import { useMemo, useState } from 'react';

export interface DonutSlice {
  /** Stable key used for React key + optional color derivation. */
  key: string;
  /** Localised label shown in tooltip + legend. */
  label: string;
  /** Numeric weight; must be finite and >= 0. */
  value: number;
}

interface Props {
  data: DonutSlice[];
  /** Format used inside tooltip and legend for the absolute number. */
  formatValue: (n: number) => string;
  /** Format used for the centre-total (defaults to `formatValue`). */
  formatTotal?: (n: number) => string;
  /** Pixel diameter of the SVG. */
  size?: number;
  /** Ring thickness. */
  thickness?: number;
  /** Optional colour resolver — defaults to a stable rotating palette. */
  colorFor?: (slice: DonutSlice, index: number) => string;
}

// Palette chosen to stay legible on both light and dark backgrounds. Order
// is significant: adjacent slices don't share a hue so the ring reads at a
// glance even with small slices.
const PALETTE = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
];

const defaultColorFor = (_slice: DonutSlice, index: number) => PALETTE[index % PALETTE.length];

/**
 * Small SVG donut chart with hover tooltip + legend. Zero-dependency
 * alternative to recharts — the whole component is ~2 kB gzipped and
 * covers everything the Dashboard needs (three breakdowns, #161).
 *
 * Slices are drawn as stroked circle arcs using `stroke-dasharray` +
 * `stroke-dashoffset`. Rotating the group by -90° puts the start of the
 * first slice at 12 o'clock.
 */
export function DonutChart({
  data,
  formatValue,
  formatTotal,
  size = 160,
  thickness = 22,
  colorFor = defaultColorFor,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = useMemo(
    () => data.reduce((s, d) => s + (Number.isFinite(d.value) && d.value > 0 ? d.value : 0), 0),
    [data],
  );

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute offsets so each <circle> can be rendered independently.
  const slices = useMemo(() => {
    let acc = 0;
    return data.map((slice, i) => {
      const value = Number.isFinite(slice.value) && slice.value > 0 ? slice.value : 0;
      const fraction = total > 0 ? value / total : 0;
      const dashLen = fraction * circumference;
      const offset = -acc;
      acc += dashLen;
      return {
        ...slice,
        index: i,
        value,
        fraction,
        dashLen,
        offset,
        color: colorFor(slice, i),
      };
    });
  }, [data, circumference, colorFor, total]);

  const centreValue = formatTotal ? formatTotal(total) : formatValue(total);

  if (total <= 0) {
    // Nothing to draw — render an empty ring so the layout doesn't jump
    // between empty and populated states.
    return (
      <div className="flex flex-col items-center gap-3">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className="stroke-gray-100 dark:stroke-gray-800"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onMouseLeave={() => setHovered(null)}
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {/* Track underneath — visible in the gaps between slices when
                dashLen doesn't cover the full circumference (small numeric
                imprecision or empty state). */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={thickness}
              className="stroke-gray-100 dark:stroke-gray-800"
            />
            {slices.map((s) => (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeOpacity={hovered === s.index ? 1 : 0.7}
                strokeDasharray={`${s.dashLen} ${circumference - s.dashLen}`}
                strokeDashoffset={s.offset}
                onMouseEnter={() => setHovered(s.index)}
                style={{ cursor: 'pointer', transition: 'stroke-opacity 120ms ease' }}
              />
            ))}
          </g>
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-gray-800 text-sm font-semibold dark:fill-gray-100"
          >
            {centreValue}
          </text>
        </svg>
        {hovered !== null && slices[hovered] && (
          <div
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
              style={{ background: slices[hovered].color }}
            />
            <span className="font-medium text-gray-800 dark:text-gray-100">
              {slices[hovered].label}
            </span>
            <span className="ml-2 text-gray-500 dark:text-gray-400">
              {formatValue(slices[hovered].value)} · {(slices[hovered].fraction * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      <ul className="w-full space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
              {(s.fraction * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
