import { createElement } from "react";
import {
  Activity,
  ArrowUpRight,
  Bike,
  Dumbbell as BarbellIcon,
  Dumbbell,
  Footprints,
  HeartPulse,
  Moon,
  Sparkles,
  Timer,
  Waves,
  Wind,
} from "lucide-react";
import type { PlannedSession } from "@/lib/db/schema";
import { getLatestJob, type JobStatusRow } from "@/lib/contracts/jobs";
import { RefreshButton } from "./refresh-button";
import { EmptyState } from "@/components/empty-state";
import { Panel, SectionTitle } from "@/components/section";
import { ReadinessRing } from "@/components/readiness-ring";
import { DriverTile, type DriverTone } from "@/components/driver-tile";
import { getTodaySummary } from "@/lib/contracts/today";
import type { TodayIntervalsActivity, TodaySummary } from "@/lib/contracts/types";
import { appTimezone, formatRelative, todayIsoDate } from "@/lib/time";

export const dynamic = "force-dynamic";

async function loadSummary(): Promise<
  { ok: true; summary: TodaySummary } | { ok: false; error: string }
> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "DATABASE_URL not configured" };
  }
  try {
    const date = todayIsoDate();
    const summary = await getTodaySummary(date);
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

async function safeGetLatestRefreshJob(): Promise<JobStatusRow | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await getLatestJob(["intervals_refresh"]);
  } catch {
    return null;
  }
}

export default async function TodayPage() {
  const tz = appTimezone();
  const result = await loadSummary();
  const today = todayIsoDate(tz);

  if (!result.ok) {
    return (
      <Shell date={today} tz={tz} latestRefreshJob={null}>
        <EmptyState
          title="Not connected yet"
          description={`Today can't load: ${result.error}. Set DATABASE_URL in .env.local and run "npm run db:push".`}
        />
      </Shell>
    );
  }

  const { summary } = result;
  const drivers = buildDrivers(summary);
  const latestRefreshJob = await safeGetLatestRefreshJob();

  return (
    <Shell
      date={summary.date}
      tz={tz}
      freshness={summary.freshness}
      latestRefreshJob={latestRefreshJob}
    >
      <section className="grid grid-cols-1 items-center gap-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-6 py-8 backdrop-blur md:grid-cols-[auto_1fr] md:gap-10 md:px-10 md:py-10">
        <div className="flex justify-center md:justify-start">
          <ReadinessRing
            score={summary.score?.score ?? null}
            status={summary.score?.status ?? null}
          />
        </div>
        <div className="space-y-4">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Today · {formatDateLabel(summary.date)}
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight text-white">
            {summary.score?.recommendation ?? "Readiness will appear here after the morning sync."}
          </h1>
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">
            {subtitleForStatus(summary.score?.status)}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Chip
              label={summary.score?.confidence ? `Confidence: ${summary.score.confidence}` : "No score yet"}
            />
            <Chip label={summary.score?.modelVersion ? `Model ${summary.score.modelVersion}` : "Model v—"} />
            {summary.checkin ? (
              <ChipLink href="/check-in" label="Checked in · edit" tone="good" />
            ) : (
              <ChipLink href="/check-in" label="Add check-in" tone="muted" />
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Recovery Drivers" action={<LinkPill href="/history">All metrics</LinkPill>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {drivers.map((d) => (
            <DriverTile
              key={d.label}
              label={d.label}
              value={d.value}
              unit={d.unit}
              hint={d.hint}
              tone={d.tone}
              icon={d.icon}
            />
          ))}
        </div>
      </section>

      {summary.decision ? <DecisionSupportSection summary={summary} /> : null}

      <TodayPlanned
        planned={summary.plannedSessions}
        completed={summary.intervalsToday}
      />

      <TodayActivities
        activities={summary.intervalsToday}
        planned={summary.plannedSessions}
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Panel>
          <SectionTitle
            title="Today's Recommendation"
            action={
              summary.score ? (
                <span className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
                  {summary.score.status}
                </span>
              ) : null
            }
          />
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--color-accent-soft)]">
              <Sparkles className="h-6 w-6 text-[var(--color-accent)]" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-display text-lg font-semibold leading-snug text-white">
                {summary.score?.recommendation ?? "Run the morning job to see your recommendation."}
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                {summary.score?.confidence
                  ? `Confidence: ${summary.score.confidence}. Scroll up for the planned session and what you've already logged today.`
                  : "Confidence will fill in after the morning score runs."}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <GhostButton disabled>Start plan unavailable</GhostButton>
            <GhostButton disabled>Regenerate unavailable</GhostButton>
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            title="AI Insights"
            action={
              summary.insight ? (
                <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {summary.insight.model} · {summary.insight.promptVersion}
                </span>
              ) : null
            }
          />
          {summary.insight ? (
            <div className="space-y-3 text-sm leading-relaxed">
              <p className="text-white">{summary.insight.summary}</p>
              {summary.insight.sessionAdvice ? (
                <p className="text-[var(--color-accent)]">{summary.insight.sessionAdvice}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              No insight cached for today. Run <code className="text-[var(--color-accent)]">cli.py insight</code> or regenerate from the recommendation card.
            </p>
          )}
        </Panel>
      </section>
    </Shell>
  );
}

function Shell({
  children,
  date,
  tz,
  freshness,
  latestRefreshJob,
}: {
  children: React.ReactNode;
  date: string;
  tz: string;
  freshness?: TodaySummary["freshness"];
  latestRefreshJob: JobStatusRow | null;
}) {
  const stalest = freshness?.reduce<string | null>((acc, f) => {
    if (!f.lastSuccessAt) return acc;
    if (!acc || f.lastSuccessAt < acc) return f.lastSuccessAt;
    return acc;
  }, null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            {tz}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Today</h1>
        </div>
        <div className="flex items-end gap-4">
          {freshness ? (
            <div className="text-right text-xs text-[var(--color-muted)]">
              <p className="font-display uppercase tracking-[0.18em]">Last sync</p>
              <p>{formatRelative(stalest)}</p>
            </div>
          ) : null}
          <RefreshButton initialLatestJob={latestRefreshJob} />
        </div>
      </header>
      {children}
      <footer className="pt-4 text-center text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
        Track · Understand · Recover
      </footer>
      <div aria-hidden>{date}</div>
    </div>
  );
}

function subtitleForStatus(status: string | null | undefined) {
  if (!status) return "No readiness score yet. Run the morning job to populate today.";
  const lower = status.toLowerCase();
  if (lower.includes("optim")) return "You're well recovered and ready to perform.";
  if (lower.includes("ok")) return "You're in a solid place. Train as planned.";
  if (lower.includes("caut")) return "Proceed with caution. Consider scaling intensity.";
  if (lower.includes("low")) return "Prioritize recovery. Keep it easy today.";
  return "Check the drivers below for context.";
}

function DecisionSupportSection({ summary }: { summary: TodaySummary }) {
  const decision = summary.decision;
  if (!decision) return null;

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1fr_1fr]">
      <Panel>
        <SectionTitle
          title="Today’s Decision"
          action={<Chip label={decisionLabel(decision.decision)} tone={decisionTone(decision.decision)} />}
        />
        <div className="space-y-3">
          <p className="font-display text-xl font-semibold text-white">{decision.title}</p>
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">{decision.summary}</p>
          <div className="flex flex-wrap gap-2">
            <Chip label={`Priority: ${priorityLabel(decision.priority)}`} tone="good" />
            <Chip label={`Goal: ${humanize(decision.primaryGoal)}`} tone="muted" />
            <Chip label={`Limiter: ${humanize(decision.limiter)}`} tone="muted" />
            <Chip label={`${decision.issueLabel} · ${decision.tissueBand} tissue`} tone="muted" />
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3 text-xs text-[var(--color-muted)]">
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              Session classification
            </p>
            <p className="mt-2">
              {humanize(decision.session.sessionType)} · {decision.session.cost} cost · {decision.session.injuryRisk} injury risk
            </p>
          </div>
          {decision.recommendedModification ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-4 py-3 text-sm text-[var(--color-muted)]">
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                Recommended modification
              </p>
              <p className="mt-2 text-white">
                {decision.recommendedModification.replaceWith}
                {decision.recommendedModification.durationMinutes
                  ? ` · ${decision.recommendedModification.durationMinutes} min`
                  : ""}
              </p>
              {decision.recommendedModification.constraints?.length ? (
                <p className="mt-1">
                  {decision.recommendedModification.constraints.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <SectionTitle title="Why" />
        <ul className="space-y-2 text-sm text-[var(--color-muted)]">
          {decision.reasons.map((reason) => (
            <li key={reason} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3">
              {reason}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <SectionTitle title="Rehab Today" />
        {decision.rehabToday ? (
          <div className="space-y-4">
            <div>
              <p className="font-display text-lg font-semibold text-white">
                {decision.rehabToday.title}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
                {decision.rehabToday.items.map((item) => (
                  <li key={item} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {decision.rehabToday.avoid.length ? (
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Avoid today
                </p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  {decision.rehabToday.avoid.join(" · ")}
                </p>
              </div>
            ) : null}
            {decision.redFlags.length ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em]">
                  Red flags
                </p>
                <p className="mt-2">{decision.redFlags.join(" · ")}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">No rehab prescription generated.</p>
        )}
      </Panel>
    </section>
  );
}

function decisionLabel(value: NonNullable<TodaySummary["decision"]>["decision"]) {
  switch (value) {
    case "go_as_planned":
      return "Go as planned";
    case "reduce_load":
      return "Reduce load";
    case "swap_session":
      return "Swap session";
    case "rehab_only":
      return "Rehab only";
    default:
      return "Decision";
  }
}

function decisionTone(value: string): "default" | "good" | "muted" {
  if (value === "go_as_planned") return "good";
  if (value === "rehab_only") return "default";
  return "muted";
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function priorityLabel(value: string) {
  switch (value) {
    case "protect_tissue":
      return "Protect tissue";
    case "maintain_consistency":
      return "Maintain consistency";
    case "progress_training":
      return "Progress training";
    default:
      return value;
  }
}

function Chip({ label, tone = "default" }: { label: string; tone?: "default" | "good" | "muted" }) {
  return (
    <span className={`rounded-full border px-3 py-1 font-display text-[10px] uppercase tracking-[0.18em] ${chipToneClass(tone)}`}>
      {label}
    </span>
  );
}

function ChipLink({
  href,
  label,
  tone = "default",
}: {
  href: string;
  label: string;
  tone?: "default" | "good" | "muted";
}) {
  return (
    <a
      href={href}
      className={`rounded-full border px-3 py-1 font-display text-[10px] uppercase tracking-[0.18em] transition hover:brightness-125 ${chipToneClass(tone)}`}
    >
      {label}
    </a>
  );
}

function chipToneClass(tone: "default" | "good" | "muted"): string {
  if (tone === "good") {
    return "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent)]";
  }
  if (tone === "muted") {
    return "border-[var(--color-border)] bg-transparent text-[var(--color-muted)]";
  }
  return "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-white";
}

function LinkPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] hover:text-white"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

function GhostButton({
  children,
  disabled = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-transparent px-5 py-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-subtle)] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

type DriverSpec = {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
  tone: DriverTone;
  icon: React.ComponentType<{ className?: string }>;
};

function buildDrivers(summary: TodaySummary): DriverSpec[] {
  const sleepHours = summary.sleep?.totalDurationMinutes
    ? +(summary.sleep.totalDurationMinutes / 60).toFixed(1)
    : null;
  const hrv = summary.score?.componentScoresJson && typeof summary.score.componentScoresJson === "object"
    ? (summary.score.componentScoresJson as Record<string, unknown>)
    : null;

  const componentScore = (key: string): number | null => {
    if (!hrv) return null;
    const v = (hrv as Record<string, unknown>)[key];
    return typeof v === "number" ? Math.round(v) : null;
  };

  return [
    {
      label: "Sleep",
      value: componentScore("sleep") ?? (sleepHours !== null ? sleepHours : null),
      unit: componentScore("sleep") !== null ? undefined : "h",
      hint: sleepHours !== null ? `${sleepHours}h total` : "no sleep record",
      tone: toneFromScore(componentScore("sleep")),
      icon: Moon,
    },
    {
      label: "HRV",
      value: componentScore("hrv"),
      hint: summary.score ? "vs baseline" : "no data",
      tone: toneFromScore(componentScore("hrv")),
      icon: HeartPulse,
    },
    {
      label: "Resting HR",
      value: componentScore("resting_hr"),
      hint: "vs baseline",
      tone: toneFromScore(componentScore("resting_hr")),
      icon: HeartPulse,
    },
    {
      label: "Soreness",
      value: summary.checkin?.soreness ?? null,
      unit: summary.checkin?.soreness != null ? "/5" : undefined,
      hint: summary.checkin ? "from check-in" : "no check-in",
      tone: summary.checkin?.soreness != null && summary.checkin.soreness >= 4 ? "caution" : "neutral",
      icon: Wind,
    },
    {
      label: "Subjective",
      value: componentScore("subjective"),
      hint: summary.checkin ? "from check-in" : "no check-in",
      tone: toneFromScore(componentScore("subjective")),
      icon: Activity,
    },
    {
      label: "Training Load",
      value: componentScore("training_load"),
      hint: "7d ratio",
      tone: toneFromScore(componentScore("training_load")),
      icon: Dumbbell,
    },
  ];
}

function toneFromScore(score: number | null): DriverTone {
  if (score === null) return "neutral";
  if (score >= 80) return "good";
  if (score >= 60) return "moderate";
  return "caution";
}

type PlannedRaw = {
  paired_activity_id?: string | number | null;
  activity_id?: string | number | null;
  category?: string;
  moving_time?: number;
  icu_training_load?: number;
  icu_intensity?: number;
  distance?: number;
  workout_doc?: {
    steps?: WorkoutStep[];
    zoneTimes?: Array<{ id: string; secs: number }>;
  };
};

type WorkoutTarget = {
  units?: string;
  value?: string | number;
};

type WorkoutStep = {
  text?: string;
  reps?: number;
  duration?: number;
  distance?: number;
  steps?: WorkoutStep[];
  pace?: WorkoutTarget;
  hr?: WorkoutTarget;
  power?: WorkoutTarget;
  cadence?: WorkoutTarget;
};

function plannedRaw(session: PlannedSession): PlannedRaw {
  const raw = session.rawJson as unknown;
  if (raw && typeof raw === "object") return raw as PlannedRaw;
  return {};
}

function matchedActivity(
  session: PlannedSession,
  completed: TodayIntervalsActivity[],
): TodayIntervalsActivity | null {
  const raw = plannedRaw(session);
  const pairedId = raw.paired_activity_id ? String(raw.paired_activity_id) : null;
  if (pairedId) {
    return completed.find((a) => a.activityId === pairedId) ?? null;
  }
  return completed.find((a) => a.pairedEventId === session.eventId) ?? null;
}

function TodayPlanned({
  planned,
  completed,
}: {
  planned: PlannedSession[];
  completed: TodayIntervalsActivity[];
}) {
  // Defensive filter: only show real workouts (category=WORKOUT).
  // TARGET (weekly volume goals) and NOTE (calendar labels) are noise.
  const workouts = planned.filter((s) => {
    const raw = typeof s.rawJson === "string"
      ? (() => { try { return JSON.parse(s.rawJson); } catch { return {}; } })()
      : (s.rawJson ?? {});
    return (raw as Record<string, unknown>).category === "WORKOUT";
  });

  if (workouts.length === 0) {
    return (
      <section>
        <SectionTitle
          title="Planned"
          action={
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              via Intervals
            </span>
          }
        />
        <Panel className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
            <Sparkles className="h-4 w-4 text-[var(--color-subtle)]" />
            <span>Nothing planned in Intervals for today — free to freestyle.</span>
          </div>
        </Panel>
      </section>
    );
  }

  const sorted = workouts
    .slice()
    .sort((a, b) => {
      const ta = a.startDateLocal ? new Date(a.startDateLocal).getTime() : 0;
      const tb = b.startDateLocal ? new Date(b.startDateLocal).getTime() : 0;
      return ta - tb;
    });

  const totalLoad = sorted.reduce((acc, s) => {
    const v = plannedRaw(s).icu_training_load;
    return acc + (typeof v === "number" ? v : 0);
  }, 0);

  const doneCount = sorted.filter((s) => matchedActivity(s, completed) !== null).length;

  return (
    <section>
      <SectionTitle
        title="Planned"
        action={
          <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            {sorted.length} session{sorted.length === 1 ? "" : "s"}
            {totalLoad > 0 ? ` · ${totalLoad} load` : ""}
            {doneCount > 0 ? ` · ${doneCount} done` : ""}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sorted.map((s) => (
          <PlannedCard
            key={s.eventId}
            session={s}
            match={matchedActivity(s, completed)}
          />
        ))}
      </div>
    </section>
  );
}

function PlannedCard({
  session,
  match,
}: {
  session: PlannedSession;
  match: TodayIntervalsActivity | null;
}) {
  const raw = plannedRaw(session);
  const plannedIcon = iconForSport(session.type);
  const durationSeconds = raw.moving_time ?? 0;
  const duration = durationSeconds > 0 ? formatDurationShort(durationSeconds) : null;
  const load = typeof raw.icu_training_load === "number" ? Math.round(raw.icu_training_load) : null;
  const intensity =
    typeof raw.icu_intensity === "number" ? Math.round(raw.icu_intensity) : null;
  const distanceKm = raw.distance && raw.distance > 0 ? raw.distance / 1000 : null;
  const topZone = pickDominantZone(raw.workout_doc?.zoneTimes);
  const steps = raw.workout_doc?.steps?.filter(hasStepContent) ?? [];
  const description = (session.description ?? "").trim();
  const descriptionShort =
    description.length > 140 ? `${description.slice(0, 137)}…` : description;

  const done = match !== null;

  return (
    <Panel
      className={`flex items-start gap-4 ${
        done ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]/40" : ""
      }`}
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
          done
            ? "bg-[var(--color-accent)] text-[#0b1320]"
            : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        }`}
      >
        {createElement(plannedIcon, { className: "h-5 w-5" })}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-display text-sm font-semibold text-white">
            {session.name ?? session.type ?? "Planned workout"}
          </p>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] ${
              done
                ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-transparent text-[var(--color-subtle)]"
            }`}
          >
            {done ? "Done" : "Planned"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
          {duration ? (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {duration}
            </span>
          ) : null}
          {distanceKm ? <span>{distanceKm.toFixed(1)} km</span> : null}
          {topZone ? <span>Z{topZone}</span> : null}
          {intensity !== null ? <span>Intensity {intensity}</span> : null}
          {load !== null ? (
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Load {load}
            </span>
          ) : null}
        </div>
        {steps.length > 0 ? (
          <WorkoutSteps steps={steps} />
        ) : descriptionShort ? (
          <p className="truncate text-xs text-[var(--color-subtle)]">
            {descriptionShort}
          </p>
        ) : null}
        {done && match ? (
          <p className="text-[11px] text-[var(--color-accent)]">
            Matched in Intervals as {match.name}
            {match.movingTime ? ` · ${formatDurationShort(match.movingTime)}` : ""}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function WorkoutSteps({ steps }: { steps: WorkoutStep[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((step, index) => (
        <WorkoutStepItem key={`${index}-${step.text ?? step.duration ?? step.distance ?? "step"}`} step={step} />
      ))}
    </ol>
  );
}

function WorkoutStepItem({ step }: { step: WorkoutStep }) {
  const childSteps = step.steps?.filter(hasStepContent) ?? [];
  const isRepeat = typeof step.reps === "number" && step.reps > 1 && childSteps.length > 0;

  if (isRepeat) {
    return (
      <li className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/35 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
            {formatRepeatLabel(step)}
          </span>
          <span className="text-[11px] text-[var(--color-subtle)]">
            {formatStepTotals(step)}
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {childSteps.map((child, index) => (
            <li
              key={`${index}-${child.duration ?? child.distance ?? "child"}`}
              className="flex items-center gap-2 text-xs text-[var(--color-muted)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/70" />
              <span>{formatStepLine(child)}</span>
            </li>
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/35 px-3 py-2 text-xs text-[var(--color-muted)]">
      {formatStepLine(step)}
    </li>
  );
}

function hasStepContent(step: WorkoutStep): boolean {
  return Boolean(
    step.text ||
      step.reps ||
      step.duration ||
      step.distance ||
      step.pace ||
      step.hr ||
      step.power ||
      step.cadence ||
      step.steps?.some(hasStepContent),
  );
}

function formatRepeatLabel(step: WorkoutStep): string {
  if (step.text && /^[\d.]+x$/i.test(step.text.trim())) return step.text.trim();
  return `${step.reps}x`;
}

function formatStepTotals(step: WorkoutStep): string {
  const parts = [formatDistance(step.distance), formatDurationMaybe(step.duration)]
    .filter(Boolean);
  return parts.join(" · ");
}

function formatStepLine(step: WorkoutStep): string {
  const target = formatTarget(step);
  const duration = formatDurationMaybe(step.duration);
  const parts = [formatDistance(step.distance), duration, target]
    .filter(Boolean);
  if (step.duration && step.duration <= 30 && !step.distance && !target) {
    return `Rest ${duration}`;
  }
  if (parts.length === 0 && step.text) return step.text;
  return parts.join(" · ");
}

function formatDistance(meters: number | undefined): string | null {
  if (!meters || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatTarget(step: WorkoutStep): string | null {
  const entries: Array<[string, WorkoutTarget | undefined]> = [
    ["Pace", step.pace],
    ["HR", step.hr],
    ["Power", step.power],
    ["Cadence", step.cadence],
  ];
  for (const [label, target] of entries) {
    if (!target || target.value == null) continue;
    const units = target.units ?? "";
    if (units.includes("zone")) return `Z${target.value} ${label}`;
    return `${target.value} ${units || label}`.trim();
  }
  return null;
}

function pickDominantZone(
  zones: Array<{ id: string; secs: number }> | undefined,
): number | null {
  if (!zones || zones.length === 0) return null;
  let best: { id: string; secs: number } | null = null;
  for (const z of zones) {
    if (!best || z.secs > best.secs) best = z;
  }
  if (!best || best.secs <= 0) return null;
  const match = /Z(\d+)/i.exec(best.id);
  return match ? Number(match[1]) : null;
}

function TodayActivities({
  activities,
  planned,
}: {
  activities: TodayIntervalsActivity[];
  planned: PlannedSession[];
}) {
  if (activities.length === 0) {
    return (
      <section>
        <SectionTitle
          title="Today's Workouts"
          action={
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              via Intervals
            </span>
          }
        />
        <Panel className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
            <Activity className="h-4 w-4 text-[var(--color-subtle)]" />
            <span>No completed Intervals workouts synced for today yet.</span>
          </div>
          <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            Updates after sync
          </span>
        </Panel>
      </section>
    );
  }

  const totalLoad = activities.reduce(
    (acc, a) => acc + (a.trainingLoad ?? 0),
    0,
  );
  const totalSeconds = activities.reduce((acc, a) => acc + (a.movingTime ?? 0), 0);
  const totalKm = activities.reduce(
    (acc, a) => acc + (a.distanceMeters ?? 0) / 1000,
    0,
  );

  return (
    <section>
      <SectionTitle
        title="Today's Workouts"
        action={
          <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            via Intervals · {activities.length} · {formatDurationShort(totalSeconds)}
            {totalKm > 0.1 ? ` · ${totalKm.toFixed(1)} km` : ""}
            {totalLoad > 0 ? ` · ${totalLoad} load` : ""}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {activities
          .slice()
          .sort((a, b) => {
            const ta = a.startDateLocal ? new Date(a.startDateLocal).getTime() : 0;
            const tb = b.startDateLocal ? new Date(b.startDateLocal).getTime() : 0;
            return tb - ta;
          })
          .map((a) => (
            <ActivityCard
              key={a.activityId}
              activity={a}
              plannedName={planned.find((p) => p.eventId === a.pairedEventId)?.name ?? null}
            />
          ))}
      </div>
    </section>
  );
}

function ActivityCard({
  activity,
  plannedName,
}: {
  activity: TodayIntervalsActivity;
  plannedName: string | null;
}) {
  const activityIcon = iconForSport(activity.type);
  const duration = activity.movingTime
    ? formatDurationShort(activity.movingTime)
    : null;
  const km = activity.distanceMeters ? activity.distanceMeters / 1000 : null;
  const pace = km && activity.movingTime ? activity.movingTime / 60 / km : null;
  const time = activity.startDateLocal
    ? formatTimeOfDay(activity.startDateLocal)
    : null;
  const title = activity.name?.trim() || sportLabel(activity.type) || "Completed workout";

  return (
    <Panel className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--color-accent-soft)]">
          {createElement(activityIcon, {
            className: "h-5 w-5 text-[var(--color-accent)]",
          })}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-display text-sm font-semibold text-white">
              {title}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {time ? (
                <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
                  {time}
                </span>
              ) : null}
              <span className="rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-[var(--color-accent)]">
                Done
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
            {duration ? (
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {duration}
              </span>
            ) : null}
            {km ? <span>{km.toFixed(1)} km</span> : null}
            {pace && (activity.type === "Run" || activity.type === "Walk") ? (
              <span>{formatPace(pace)}/km</span>
            ) : null}
            {activity.intensity ? (
              <span>Intensity {Math.round(activity.intensity)}</span>
            ) : null}
            {activity.averageHr ? (
              <span className="inline-flex items-center gap-1">
                <HeartPulse className="h-3 w-3" />
                {Math.round(activity.averageHr)} bpm
              </span>
            ) : null}
            {activity.trainingLoad ? (
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Load {activity.trainingLoad}
              </span>
            ) : null}
            {plannedName ? <span>Matched to {plannedName}</span> : null}
            {activity.source ? <span>Source {sourceLabel(activity.source)}</span> : null}
          </div>
        </div>
    </Panel>
  );
}

function sportLabel(sport: string | null): string | null {
  if (!sport) return null;
  const spaced = sport
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced || null;
}

function sourceLabel(source: string): string {
  const normalized = source.replace(/[_-]+/g, " ").toLowerCase();
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function iconForSport(sport: string | null): React.ComponentType<{ className?: string }> {
  const key = (sport ?? "").toLowerCase();
  if (key.includes("ride") || key.includes("cycl") || key.includes("bike")) return Bike;
  if (key.includes("run")) return Footprints;
  if (key.includes("swim")) return Waves;
  if (key.includes("weight") || key.includes("strength")) return BarbellIcon;
  return Activity;
}

function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

function formatDurationMaybe(seconds: number | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  return formatDurationShort(seconds);
}

function formatPace(minutesPerKm: number): string {
  const m = Math.floor(minutesPerKm);
  const s = Math.round((minutesPerKm - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDateLabel(raw: string): string {
  // Convert "20260427" or "2026-04-27" → "27 Apr 2026"
  const cleaned = raw.replace(/-/g, "");
  if (cleaned.length !== 8) return raw;
  const y = cleaned.slice(0, 4);
  const m = cleaned.slice(4, 6);
  const d = cleaned.slice(6, 8);
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatTimeOfDay(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: process.env.APP_TIMEZONE || undefined,
  }).format(d);
}
