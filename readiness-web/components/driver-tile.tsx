import { cn } from "@/lib/utils";

export type DriverTone = "good" | "moderate" | "caution" | "neutral";

export function DriverTile({
  label,
  value,
  unit,
  tone = "neutral",
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  tone?: DriverTone;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    good: "text-[var(--color-accent)]",
    moderate: "text-[var(--color-info)]",
    caution: "text-[var(--color-caution)]",
    neutral: "text-white",
  }[tone];

  const display = value === null || value === undefined || value === "" ? "No data" : value;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
          {label}
        </span>
        {Icon ? <Icon className={cn("h-4 w-4", toneClass)} /> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-display text-3xl font-semibold tabular-nums", toneClass)}>
          {display}
        </span>
        {unit ? (
          <span className="text-xs font-medium text-[var(--color-muted)]">{unit}</span>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  );
}
