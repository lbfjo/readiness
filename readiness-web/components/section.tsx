import { cn } from "@/lib/utils";

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-5 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
