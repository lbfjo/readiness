/**
 * Timezone-aware "today" resolution. The canonical timezone lives in the
 * `settings` table; until that's wired, we fall back to `APP_TIMEZONE` or
 * the system zone. This is the one place that decides the day boundary.
 */
export function appTimezone(): string {
  return (
    process.env.APP_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
  );
}

export function todayIsoDate(tz: string = appTimezone()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  // Legacy Python scoring uses compact YYYYMMDD as the primary key for every
  // per-day table. Keep the UI layer consistent until we migrate keys.
  return `${year}${month}${day}`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
