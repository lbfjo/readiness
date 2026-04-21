import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-14 text-center",
        className,
      )}
    >
      <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-white">
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-sm text-[var(--color-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
