import { ArrowDownRight, ArrowUpRight, HeartPulse, Moon, Activity, Dumbbell } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Panel, SectionTitle } from "@/components/section";
import { LineChart, Sparkline, type ChartPoint } from "@/components/trend-chart";
import { addDaysIso, formatShortDate, getTrends, type TrendDay } from "@/lib/contracts/trends";
import { appTimezone, todayIsoDate } from "@/lib/time";

type RangeKey = "14d" | "90d";

const RANGES: Record<RangeKey, { days: number; label: string }> = {
  "14d": { days: 14, label: "14 days" },
  "90d": { days: 90, label: "90 days" },
};

function parseRange(value: string | string[] | undefined): RangeKey {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "90d" ? "90d" : "14d";
}

async function loadTrends(range: RangeKey): Promise<
  | {
      ok: true;
      days: TrendDay[];
      latest: Awaited<ReturnType<typeof getTrends>>["latest"];
      fromDate: string;
      toDate: string;
    }
  | { ok: false; error: string }
> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "DATABASE_URL not configured" };
  }
  try {
    const tz = appTimezone();
    const toDate = todayIsoDate(tz);
    const fromDate = addDaysIso(toDate, -(RANGES[range].days - 1));
    const result = await getTrends(fromDate, toDate);
    return { ok: true, days: result.days, latest: result.latest, fromDate, toDate };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const result = await loadTrends(range);

  if (!result.ok) {
    return (
      <Shell range={range}>
        <EmptyState
          title="Not connected yet"
          description={`Trends can't load: ${result.error}. Set DATABASE_URL in .env.local and run a sync.`}
        />
      </Shell>
    );
  }

  const { days, latest, fromDate, toDate } = result;
  const dailyLatest = days[days.length - 1] ?? null;
  const scorePoints: ChartPoint[] = days.map((d) => ({ date: d.date, value: d.score }));
  const metricCards = buildMetricCards(days);

  return (
    <Shell range={range}>
      <section className="space-y-4">
        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                Readiness · {RANGES[range].label}
              </p>
              <div className="mt-1 flex items-end gap-3">
                <p className="font-display text-5xl font-bold leading-none text-white">
                  {latest.score?.score ?? "—"}
                </p>
                <div className="pb-1 text-xs text-[var(--color-muted)]">
                  <p className="uppercase tracking-[0.18em] text-[var(--color-accent)]">
                    {latest.score?.status ?? "no score"}
                  </p>
                  <p>{summaryLine(days)}</p>
                </div>
              </div>
            </div>
            <div className="text-right text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              <p>{formatShortDate(fromDate)} → {formatShortDate(toDate)}</p>
              <p>{days.filter((d) => d.score !== null).length} scored days</p>
            </div>
          </div>
          <div className="h-[240px] w-full">
            <LineChart data={scorePoints} yMin={0} yMax={100} gridLines={[0, 20, 40, 60, 80, 100]} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            <LegendDot color="var(--color-accent)" /> Readiness
            <span className="mx-2 text-[var(--color-border-strong)]">·</span>
            <span>
              check-in days: {days.filter((d) => d.checkedIn).length} / {days.length}
            </span>
          </div>
        </Panel>
      </section>

      <section>
        <SectionTitle title="Metric trends" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((m) => (
            <MetricCard key={m.label} card={m} />
          ))}
        </div>
      </section>

      {dailyLatest ? (
        <section>
          <SectionTitle title={`Today · ${formatShortDate(dailyLatest.date)}`} />
          <Panel>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <MiniStat label="Score" value={fmt(dailyLatest.score)} accent />
              <MiniStat label="HRV" value={fmt(dailyLatest.hrv)} unit="ms" />
              <MiniStat label="RHR" value={fmt(dailyLatest.rhr)} unit="bpm" />
              <MiniStat
                label="Sleep"
                value={
                  dailyLatest.sleepMinutes
                    ? (dailyLatest.sleepMinutes / 60).toFixed(1)
                    : "—"
                }
                unit="h"
              />
            </div>
          </Panel>
        </section>
      ) : null}
    </Shell>
  );
}

function summaryLine(days: TrendDay[]): string {
  const scored = days.filter((d) => d.score !== null) as (TrendDay & { score: number })[];
  if (scored.length < 2) return "Not enough data to show a trend.";
  const first = scored[0];
  const last = scored[scored.length - 1];
  const delta = last.score - first.score;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const magnitude = Math.abs(delta);
  if (direction === "flat") return `Holding steady around ${Math.round(avg(scored.map((d) => d.score)))}.`;
  return `${direction === "up" ? "Up" : "Down"} ${magnitude} pts vs ${formatShortDate(first.date)}.`;
}

function buildMetricCards(days: TrendDay[]): MetricCardSpec[] {
  return [
    {
      label: "HRV",
      unit: "ms",
      icon: HeartPulse,
      higherIsBetter: true,
      points: days.map((d) => ({ date: d.date, value: d.hrv })),
    },
    {
      label: "RHR",
      unit: "bpm",
      icon: HeartPulse,
      higherIsBetter: false,
      points: days.map((d) => ({ date: d.date, value: d.rhr })),
    },
    {
      label: "Sleep",
      unit: "h",
      icon: Moon,
      higherIsBetter: true,
      points: days.map((d) => ({
        date: d.date,
        value: d.sleepMinutes !== null ? +(d.sleepMinutes / 60).toFixed(2) : null,
      })),
    },
    {
      label: "Training Load",
      unit: "",
      icon: Dumbbell,
      higherIsBetter: true,
      points: days.map((d) => ({ date: d.date, value: d.trainingLoad })),
    },
    {
      label: "Load Ratio",
      unit: "",
      icon: Activity,
      higherIsBetter: false,
      points: days.map((d) => ({
        date: d.date,
        value: d.trainingLoadRatio !== null ? +d.trainingLoadRatio.toFixed(2) : null,
      })),
      hint: "ATL:CTL — >1.3 = overreaching",
    },
  ];
}

type MetricCardSpec = {
  label: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  higherIsBetter: boolean;
  points: ChartPoint[];
  hint?: string;
};

function MetricCard({ card }: { card: MetricCardSpec }) {
  const numericPoints = card.points.filter(
    (p): p is ChartPoint & { value: number } => p.value !== null,
  );
  const latest = numericPoints.length > 0 ? numericPoints[numericPoints.length - 1].value : null;
  const baseline =
    numericPoints.length > 2
      ? avg(numericPoints.slice(0, Math.max(1, Math.floor(numericPoints.length / 3))).map((p) => p.value))
      : null;
  const delta = latest !== null && baseline !== null ? latest - baseline : null;
  const direction =
    delta === null || Math.abs(delta) < 0.01
      ? "flat"
      : delta > 0
        ? "up"
        : "down";

  const isImprovement =
    direction === "flat"
      ? null
      : card.higherIsBetter
        ? direction === "up"
        : direction === "down";

  const toneClass =
    isImprovement === null
      ? "text-[var(--color-muted)]"
      : isImprovement
        ? "text-[var(--color-accent)]"
        : "text-[var(--color-caution)]";

  const Icon = card.icon;
  const yValues = numericPoints.map((p) => p.value);
  const yMin = yValues.length ? Math.floor(Math.min(...yValues) - 1) : undefined;
  const yMax = yValues.length ? Math.ceil(Math.max(...yValues) + 1) : undefined;

  return (
    <Panel className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--color-accent-soft)]">
            <Icon className="h-4 w-4 text-[var(--color-accent)]" />
          </div>
          <div>
            <p className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
              {card.label}
            </p>
            {card.hint ? (
              <p className="text-[10px] text-[var(--color-subtle)]">{card.hint}</p>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold leading-none text-white">
            {latest === null ? "—" : fmt(latest)}
            {card.unit ? (
              <span className="ml-0.5 text-xs font-semibold text-[var(--color-muted)]">
                {card.unit}
              </span>
            ) : null}
          </p>
          {delta !== null ? (
            <p className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold ${toneClass}`}>
              {direction === "up" ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : direction === "down" ? (
                <ArrowDownRight className="h-3 w-3" />
              ) : null}
              {fmt(Math.abs(delta))} vs early
            </p>
          ) : null}
        </div>
      </div>
      <div className="h-[52px] w-full">
        <Sparkline
          data={card.points}
          yMin={yMin}
          yMax={yMax}
          color={
            isImprovement === false
              ? "var(--color-caution)"
              : "var(--color-accent)"
          }
        />
      </div>
    </Panel>
  );
}

function MiniStat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {label}
      </p>
      <p
        className={`font-display text-2xl font-bold ${accent ? "text-[var(--color-accent)]" : "text-white"}`}
      >
        {value}
        {unit ? <span className="ml-0.5 text-xs text-[var(--color-muted)]">{unit}</span> : null}
      </p>
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function Shell({ children, range }: { children: React.ReactNode; range: RangeKey }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Trends
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Readiness over time
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Readiness, HRV, sleep, RHR and training load across the chosen window.
          </p>
        </div>
        <RangeToggle active={range} />
      </header>
      {children}
    </div>
  );
}

function RangeToggle({ active }: { active: RangeKey }) {
  return (
    <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
      {(Object.keys(RANGES) as RangeKey[]).map((key) => {
        const isActive = key === active;
        return (
          <a
            key={key}
            href={`/history?range=${key}`}
            className={
              isActive
                ? "rounded-full bg-[var(--color-accent)] px-3 py-1 text-[#0b1320]"
                : "rounded-full px-3 py-1 text-[var(--color-muted)] hover:text-white"
            }
          >
            {RANGES[key].label}
          </a>
        );
      })}
    </div>
  );
}
