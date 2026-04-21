import { AlertTriangle } from "lucide-react";
import type { SubjectiveCheckin } from "@/lib/db/schema";
import { addDaysIso, formatShortDate } from "@/lib/contracts/trends";
import { Panel, SectionTitle } from "@/components/section";

/**
 * Fixed-grid heatmap of the last N days of check-ins. Each dimension is a
 * row, each day a column. Missing days render as faint placeholder tiles so
 * gaps are obvious without breaking the grid rhythm.
 *
 * Colour semantics:
 * - Energy, Mood: higher = better  → accent gradient
 * - Soreness, Stress: higher = worse → caution gradient
 * Illness (boolean) gets its own icon row at the top of the column.
 */

type Dim = {
  key: "energy" | "mood" | "soreness" | "stress";
  label: string;
  tone: "accent" | "caution";
};

const DIMS: Dim[] = [
  { key: "energy", label: "Energy", tone: "accent" },
  { key: "mood", label: "Mood", tone: "accent" },
  { key: "soreness", label: "Soreness", tone: "caution" },
  { key: "stress", label: "Stress", tone: "caution" },
];

export function CheckinHeatmap({
  history,
  today,
  days = 14,
}: {
  history: SubjectiveCheckin[];
  today: string;
  days?: number;
}) {
  // Index by date (compact YYYYMMDD) for O(1) lookup per cell.
  const byDate = new Map<string, SubjectiveCheckin>();
  for (const row of history) byDate.set(row.date, row);

  // Build column list oldest → newest so the left edge is the past and the
  // right edge is "today". Reads like a timeline.
  const columns: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    columns.push(addDaysIso(today, -i));
  }

  const filled = columns.filter((d) => byDate.has(d)).length;
  const illnessDays = columns.filter((d) => byDate.get(d)?.illness === 1).length;

  return (
    <Panel className="space-y-3">
      <SectionTitle
        title={`Last ${days} days`}
        action={
          <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            {filled} / {days} checked in
            {illnessDays > 0 ? ` · ${illnessDays} ill` : ""}
          </span>
        }
      />

      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `minmax(64px, 92px) repeat(${days}, minmax(0, 1fr))`,
        }}
      >
        {/* Header row — illness indicators */}
        <div className="flex items-end justify-end pr-2 text-[9px] font-display uppercase tracking-[0.18em] text-[var(--color-subtle)]">
          Illness
        </div>
        {columns.map((d) => {
          const row = byDate.get(d);
          const ill = row?.illness === 1;
          return (
            <div
              key={`ill-${d}`}
              className="grid place-items-center"
              title={ill ? `${formatShortDate(d)} · illness flagged` : undefined}
            >
              {ill ? (
                <AlertTriangle className="h-3 w-3 text-[var(--color-caution)]" />
              ) : (
                <span className="text-[8px] text-[var(--color-subtle)]">·</span>
              )}
            </div>
          );
        })}

        {/* Dimension rows */}
        {DIMS.map((dim) => (
          <DimRow key={dim.key} dim={dim} columns={columns} byDate={byDate} />
        ))}

        {/* Footer date row */}
        <div />
        {columns.map((d, i) => {
          const isToday = d === today;
          const show = i === 0 || i === columns.length - 1 || (days >= 14 && i === Math.floor(columns.length / 2));
          return (
            <div
              key={`label-${d}`}
              className={`truncate pt-1 text-center text-[9px] font-display uppercase tracking-[0.12em] ${
                isToday ? "text-[var(--color-accent)]" : "text-[var(--color-subtle)]"
              }`}
            >
              {show ? formatShortDate(d).replace(/ /, "\u00A0") : ""}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
        <span>Scale 1–5</span>
        <span className="mx-1 text-[var(--color-border-strong)]">·</span>
        <LegendScale tone="accent" label="energy / mood — higher is better" />
        <span className="mx-1 text-[var(--color-border-strong)]">·</span>
        <LegendScale tone="caution" label="soreness / stress — lower is better" />
      </div>
    </Panel>
  );
}

function DimRow({
  dim,
  columns,
  byDate,
}: {
  dim: Dim;
  columns: string[];
  byDate: Map<string, SubjectiveCheckin>;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-2 text-[10px] font-display uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {dim.label}
      </div>
      {columns.map((d) => {
        const row = byDate.get(d);
        const value = row ? (row[dim.key] as number | null) : null;
        return (
          <Cell key={`${dim.key}-${d}`} date={d} value={value} dim={dim} />
        );
      })}
    </>
  );
}

function Cell({
  date,
  value,
  dim,
}: {
  date: string;
  value: number | null;
  dim: Dim;
}) {
  const severity = severityFor(dim, value);
  const bg = cellBackground(dim.tone, severity);
  return (
    <div
      className="aspect-square rounded-md border border-[var(--color-border)]/70 transition-colors"
      style={{ backgroundColor: bg }}
      title={
        value === null
          ? `${formatShortDate(date)} · no check-in`
          : `${formatShortDate(date)} · ${dim.label} ${value}/5`
      }
    />
  );
}

/**
 * Maps a 1–5 rating into a 0–1 severity where 1 = "strong signal in the bad
 * direction for the tone". For accent tone (higher=better), value 5 → 0
 * severity (full positive) and value 1 → 1 severity. For caution tone
 * (higher=worse), value 5 → 1 severity and value 1 → 0 severity.
 *
 * Wait — we actually want colour *intensity* to scale with *magnitude of the
 * signal*, not specifically "bad-ness". For a cleaner read, we colour by
 * magnitude regardless of direction; the legend tells the user which way is
 * good. So:
 *   accent tone  → intensity = value / 5      (green bright = good strong)
 *   caution tone → intensity = value / 5      (red bright = bad strong)
 * Null stays at 0.
 */
function severityFor(dim: Dim, value: number | null): number {
  if (value === null) return 0;
  const clamped = Math.max(1, Math.min(5, value));
  return clamped / 5;
}

function cellBackground(tone: Dim["tone"], severity: number): string {
  if (severity === 0) {
    return "color-mix(in srgb, var(--color-surface-2) 80%, transparent)";
  }
  const colorVar = tone === "accent" ? "--color-accent" : "--color-caution";
  // 18% floor so even a 1/5 reading is visible; 82% ceiling so a 5/5 is bold
  // without blowing out against the panel background.
  const pct = Math.round(18 + severity * 64);
  return `color-mix(in srgb, var(${colorVar}) ${pct}%, transparent)`;
}

function LegendScale({
  tone,
  label,
}: {
  tone: Dim["tone"];
  label: string;
}) {
  const stops = [1, 2, 3, 4, 5];
  return (
    <span className="inline-flex items-center gap-1 normal-case tracking-normal text-[var(--color-muted)]">
      <span className="inline-flex gap-[2px]">
        {stops.map((s) => (
          <span
            key={s}
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: cellBackground(tone, s / 5) }}
          />
        ))}
      </span>
      <span className="text-[10px]">{label}</span>
    </span>
  );
}
