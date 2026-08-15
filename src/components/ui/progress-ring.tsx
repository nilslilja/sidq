import { cn } from '@/lib/cn';

interface ProgressRingProps {
  /** 0..1. Clamped, so a caller passing 1.2 or NaN cannot break the arc. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Monospace numerals in the dead centre. Kept as children so the ring stays dumb. */
  children?: React.ReactNode;
  label?: string;
}

/*
 * Component E. One thin ring, no glow, no decoration, no library.
 * Serves double duty: the day's momentum meter and the focus-mode countdown.
 */
export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 2,
  className,
  children,
  label,
}: ProgressRingProps) {
  const safe = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe);

  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(safe * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset var(--duration-slow) var(--ease-out-expo)',
          }}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 grid place-items-center tabular leading-none">{children}</div>
      ) : null}
    </div>
  );
}
