interface LogoProps {
  className?: string;
}

/** The brand mark: a roof over two ledger bars (budget / spent). Color comes from `currentColor`; the shorter bar is always sand. */
export function Logo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M8 30 L32 11 L56 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="16" y="37" width="32" height="7" rx="3.5" fill="currentColor" />
      <rect x="16" y="49" width="20" height="7" rx="3.5" fill="#E3B778" />
    </svg>
  );
}

interface LogoWithWordmarkProps {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}

export function LogoWithWordmark({
  className,
  markClassName,
  textClassName,
}: LogoWithWordmarkProps) {
  return (
    <div className={className ?? 'flex items-center gap-2'}>
      <Logo className={markClassName ?? 'h-6 w-6'} />
      <span className={textClassName ?? 'text-lg font-bold tracking-tight'}>
        Household
      </span>
    </div>
  );
}
