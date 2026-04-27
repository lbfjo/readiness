import Link from "next/link";
import { createElement } from "react";
import {
  Activity,
  ArrowUpRight,
  Bike,
  ChevronRight,
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
import type { JobQueueRow, PlannedSession, StravaActivity } from "@/lib/db/schema";
import { getLatestJob } from "@/lib/contracts/jobs";
import { RefreshButton } from "./refresh-button";
import { EmptyState } from "@/components/empty-state";
import { Panel, SectionTitle } from "@/components/section";
import { ReadinessRing } from "@/components/readiness-ring";
import { DriverTile, type DriverTone } from "@/components/driver-tile";
import { getTodaySummary } from "@/lib/contracts/today";
import type { TodaySummary } from "@/lib/contracts/types";
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

async function safeGetLatestRefreshJob(): Promise<JobQueueRow | null> {
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
            Today · {summary.date}
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
        completed={summary.stravaToday}
      />

      <TodayActivities activities={summary.stravaToday} />

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
          <div className="mt-5 flex gap-3">
            <PrimaryButton>Start plan</PrimaryButton>
            <GhostButton>Regenerate insight</GhostButton>
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
  latestRefreshJob: JobQueueRow | null;
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

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-[#0b1320] transition hover:brightness-110"
    >
      {children}
    </button>
  );
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-transparent px-5 py-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[var(--color-surface-2)]"
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
  moving_time?: number;
  icu_training_load?: number;
  icu_intensity?: number;
  distance?: number;
  workout_doc?: {
    zoneTimes?: Array<{ id: string; secs: number }>;
  };
};

function plannedRaw(session: PlannedSession): PlannedRaw {
  const raw = session.rawJson as unknown;
  if (raw && typeof raw === "object") return raw as PlannedRaw;
  return {};
}

// Very small sport-category mapper. Intervals uses "Run" / "Ride" / "Swim" /
// "Walk" / "WeightTraining" etc.; Strava uses e.g. "Run" / "TrailRun" /
// "VirtualRun" / "Ride" / "MountainBikeRide" / "Swim" / "Hike". Anything we
// don't recognise falls back to "other" so we don't match by accident.
type SportCategory = "run" | "ride" | "swim" | "walk" | "strength" | "other";

function sportCategory(value: string | null | undefined): SportCategory {
  const key = (value ?? "").toLowerCase();
  if (key.includes("ride") || key.includes("cycl") || key.includes("bike")) return "ride";
  if (key.includes("run")) return "run";
  if (key.includes("swim")) return "swim";
  if (key.includes("walk") || key.includes("hike")) return "walk";
  if (key.includes("weight") || key.includes("strength") || key.includes("lift")) {
    return "strength";
  }
  return "other";
}

function matchedActivity(
  session: PlannedSession,
  completed: StravaActivity[],
): StravaActivity | null {
  const target = sportCategory(session.type);
  if (target === "other") return null;
  return (
    completed.find((a) => sportCategory(a.sportType ?? a.type) === target) ?? null
  );
}

function TodayPlanned({
  planned,
  completed,
}: {
  planned: PlannedSession[];
  completed: StravaActivity[];
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
  match: StravaActivity | null;
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
        {descriptionShort ? (
          <p className="truncate text-xs text-[var(--color-subtle)]">
            {descriptionShort}
          </p>
        ) : null}
        {done && match ? (
          <p className="text-[11px] text-[var(--color-accent)]">
            Logged as {match.name ?? match.sportType ?? "activity"}
            {match.movingTime ? ` · ${formatDurationShort(match.movingTime)}` : ""}
          </p>
        ) : null}
      </div>
    </Panel>
  );
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

function TodayActivities({ activities }: { activities: StravaActivity[] }) {
  if (activities.length === 0) {
    return (
      <section>
        <SectionTitle
          title="Today's Workouts"
          action={
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              via Strava
            </span>
          }
        />
        <Panel className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
            <Activity className="h-4 w-4 text-[var(--color-subtle)]" />
            <span>No workouts logged yet today.</span>
          </div>
          <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            Updates after sync
          </span>
        </Panel>
      </section>
    );
  }

  const totalLoad = activities.reduce(
    (acc, a) => acc + (typeof a.sufferScore === "number" ? a.sufferScore : 0),
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
            {activities.length} · {formatDurationShort(totalSeconds)}
            {totalKm > 0.1 ? ` · ${totalKm.toFixed(1)} km` : ""}
            {totalLoad > 0 ? ` · ${totalLoad} suffer` : ""}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {activities
          .slice()
          .sort((a, b) => {
            const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
            const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
            return tb - ta;
          })
          .map((a) => (
            <ActivityCard key={a.activityId} activity={a} />
          ))}
      </div>
    </section>
  );
}

function ActivityCard({ activity }: { activity: StravaActivity }) {
  const activityIcon = iconForSport(activity.sportType);
  const duration = formatDurationShort(activity.movingTime ?? 0);
  const km = activity.distanceMeters ? activity.distanceMeters / 1000 : null;
  const pace = km && activity.movingTime ? activity.movingTime / 60 / km : null;
  const time = activity.startDateLocal
    ? formatTimeOfDay(activity.startDateLocal)
    : activity.startDate
      ? formatTimeOfDay(activity.startDate)
      : null;

  return (
    <Link
      href={`/activity/${encodeURIComponent(activity.activityId)}`}
      className="group block rounded-3xl outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0e14]"
      aria-label={`Open details for ${activity.name ?? "workout"}`}
    >
      <Panel className="flex items-start gap-4 transition group-hover:border-[var(--color-accent)]/35">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--color-accent-soft)]">
          {createElement(activityIcon, {
            className: "h-5 w-5 text-[var(--color-accent)]",
          })}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-display text-sm font-semibold text-white">
              {activity.name ?? activity.sportType ?? "Workout"}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {time ? (
                <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
                  {time}
                </span>
              ) : null}
              <ChevronRight className="h-4 w-4 text-[var(--color-subtle)] transition group-hover:text-[var(--color-accent)]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {duration}
            </span>
            {km ? <span>{km.toFixed(1)} km</span> : null}
            {pace && (activity.sportType === "Run" || activity.sportType === "Walk") ? (
              <span>{formatPace(pace)}/km</span>
            ) : null}
            {activity.averageHr ? (
              <span className="inline-flex items-center gap-1">
                <HeartPulse className="h-3 w-3" />
                {Math.round(activity.averageHr)} bpm
              </span>
            ) : null}
            {activity.sufferScore ? (
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Suffer {Math.round(activity.sufferScore)}
              </span>
            ) : null}
          </div>
        </div>
      </Panel>
    </Link>
  );
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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

function formatPace(minutesPerKm: number): string {
  const m = Math.floor(minutesPerKm);
  const s = Math.round((minutesPerKm - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
