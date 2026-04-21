import { cn } from "@/lib/utils";

/**
 * Hero readiness ring. Pure SVG, server-renderable. The accent arc length is
 * a function of `score` (0-100). `status` shows below the number.
 */
export function ReadinessRing({
  score,
  status,
  size = 280,
  stroke = 14,
  className,
}: {
  score: number | null;
  status: string | null;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score ?? 0));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id="ring-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A6FF00" />
            <stop offset="100%" stopColor="#7DD3FC" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ring-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-[80px] font-bold leading-none tracking-tight">
          {score ?? "—"}
        </p>
        <p className="mt-1 font-display text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">
          Readiness
        </p>
        {status ? (
          <p className="mt-3 text-sm font-medium text-[var(--color-accent)]">{status}</p>
        ) : null}
      </div>
    </div>
  );
}
