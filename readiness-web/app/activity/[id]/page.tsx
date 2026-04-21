import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, HeartPulse } from "lucide-react";
import { ActivityRouteMap } from "@/components/activity-route-map";
import { Panel, SectionTitle } from "@/components/section";
import { getStravaActivity } from "@/lib/contracts/strava-activity";
import { parseStravaActivityRaw, type StravaSplit } from "@/lib/strava-raw";
import { appTimezone } from "@/lib/time";

type Props = { params: Promise<{ id: string }> };

export default async function ActivityDetailPage({ params }: Props) {
  const { id } = await params;
  if (!process.env.DATABASE_URL) {
    return (
      <Shell backHref="/today">
        <Panel>
          <p className="text-sm text-[var(--color-muted)]">DATABASE_URL not configured.</p>
        </Panel>
      </Shell>
    );
  }

  const row = await getStravaActivity(id);
  if (!row) notFound();

  const raw = parseStravaActivityRaw(row.rawJson);
  const polyline = raw.map?.summary_polyline;
  const splits = pickSplits(raw);
  const tz = appTimezone();

  const sport = row.sportType ?? raw.sport_type ?? raw.type ?? "Activity";
  const startLocal = row.startDateLocal
    ? formatDateTime(row.startDateLocal, tz)
    : row.startDate
      ? formatDateTime(row.startDate, tz)
      : "—";

  const km = row.distanceMeters ? row.distanceMeters / 1000 : null;
  const moving = formatDurationShort(row.movingTime ?? 0);
  const elapsed = formatDurationShort(row.elapsedTime ?? 0);

  return (
    <Shell backHref="/today">
      <header className="space-y-2">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Strava · {row.localDay ?? "—"}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
          {row.name ?? "Workout"}
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          {sport}
          <span className="mx-2 text-[var(--color-border-strong)]">·</span>
          {startLocal}
        </p>
        <a
          href={`https://www.strava.com/activities/${row.activityId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)] hover:brightness-110"
        >
          Open in Strava
          <ExternalLink className="h-3 w-3" />
        </a>
      </header>

      {polyline ? (
        <section>
          <SectionTitle title="Route" />
          <ActivityRouteMap polyline={polyline} />
        </section>
      ) : null}

      <section>
        <SectionTitle title="Summary" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Distance" value={km !== null ? `${km.toFixed(2)} km` : "—"} />
          <Stat label="Moving" value={moving} />
          <Stat label="Elapsed" value={elapsed} />
          <Stat
            label="Elevation"
            value={row.elevationGain != null ? `${Math.round(row.elevationGain)} m` : "—"}
          />
          <Stat
            label="Avg HR"
            value={
              row.averageHr != null ? (
                <span className="inline-flex items-center gap-1">
                  <HeartPulse className="h-4 w-4 text-[var(--color-accent)]" />
                  {Math.round(row.averageHr)} bpm
                </span>
              ) : (
                "—"
              )
            }
          />
          <Stat
            label="Max HR"
            value={row.maxHr != null ? `${Math.round(row.maxHr)} bpm` : "—"}
          />
          <Stat
            label="Suffer"
            value={
              row.sufferScore != null && row.sufferScore > 0
                ? String(Math.round(row.sufferScore))
                : "—"
            }
          />
          <Stat label="Work" value={raw.kilojoules != null ? `${Math.round(raw.kilojoules)} kJ` : "—"} />
          {row.averageWatts != null ? (
            <Stat label="Avg power" value={`${Math.round(row.averageWatts)} W`} />
          ) : null}
          {row.weightedAverageWatts != null ? (
            <Stat label="NP" value={`${Math.round(row.weightedAverageWatts)} W`} />
          ) : null}
        </div>
      </section>

      {(raw.kudos_count != null && raw.kudos_count > 0) ||
      (raw.comment_count != null && raw.comment_count > 0) ? (
        <section>
          <SectionTitle title="Social" />
          <Panel className="flex flex-wrap gap-4 text-sm text-[var(--color-muted)]">
            {raw.kudos_count != null && raw.kudos_count > 0 ? (
              <span>{raw.kudos_count} kudos</span>
            ) : null}
            {raw.comment_count != null && raw.comment_count > 0 ? (
              <span>{raw.comment_count} comments</span>
            ) : null}
          </Panel>
        </section>
      ) : null}

      {raw.device_name ? (
        <section>
          <SectionTitle title="Device" />
          <Panel>
            <p className="text-sm text-[var(--color-muted)]">{raw.device_name}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              {raw.trainer ? <span className="rounded-full border px-2 py-0.5">Trainer</span> : null}
              {raw.commute ? <span className="rounded-full border px-2 py-0.5">Commute</span> : null}
              {raw.manual ? <span className="rounded-full border px-2 py-0.5">Manual</span> : null}
            </div>
          </Panel>
        </section>
      ) : null}

      <section>
        <SectionTitle
          title="Lap splits"
          action={
            splits.length > 0 ? (
              <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
                {splits.length} laps
              </span>
            ) : null
          }
        />
        {splits.length > 0 ? (
          <SplitsTable splits={splits} isRun={isRunLike(sport)} />
        ) : (
          <Panel>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">
              Lap-by-lap splits are not included in the Strava activity-list sync we
              store today. They appear once we fetch the single-activity detail
              endpoint (future enhancement). Route and summary stats above come from
              what we already have.
            </p>
          </Panel>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children, backHref }: { children: ReactNode; backHref: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Link>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Panel className="space-y-1 py-4">
      <p className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className="font-display text-lg font-semibold text-white">{value}</p>
    </Panel>
  );
}

function pickSplits(raw: ReturnType<typeof parseStravaActivityRaw>): StravaSplit[] {
  const metric = raw.splits_metric;
  const standard = raw.splits_standard;
  if (metric && Array.isArray(metric) && metric.length > 0) return metric;
  if (standard && Array.isArray(standard) && standard.length > 0) return standard;
  return [];
}

function isRunLike(sport: string): boolean {
  const k = sport.toLowerCase();
  return k.includes("run") || k.includes("walk") || k.includes("hike");
}

function SplitsTable({ splits, isRun }: { splits: StravaSplit[]; isRun: boolean }) {
  return (
    <Panel className="overflow-x-auto p-0">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Distance</th>
            <th className="px-4 py-3">Time</th>
            {isRun ? <th className="px-4 py-3">Pace /km</th> : null}
            <th className="px-4 py-3">Avg HR</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((s, i) => {
            const km = s.distance != null ? s.distance / 1000 : null;
            const mov = s.moving_time ?? 0;
            const pace =
              isRun && km && km > 0.01 && mov > 0 ? mov / 60 / km : null;
            return (
              <tr key={i} className="border-b border-[var(--color-border)]/60 last:border-0">
                <td className="px-4 py-2.5 font-display text-[var(--color-muted)]">
                  {(s.split ?? i + 1).toString()}
                </td>
                <td className="px-4 py-2.5 text-white">
                  {km !== null ? `${km.toFixed(2)} km` : "—"}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-muted)]">{formatDurationShort(mov)}</td>
                {isRun ? (
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">
                    {pace !== null ? `${formatPace(pace)}/km` : "—"}
                  </td>
                ) : null}
                <td className="px-4 py-2.5 text-[var(--color-muted)]">
                  {s.average_heartrate != null ? `${Math.round(s.average_heartrate)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatPace(minutesPerKm: number): string {
  const m = Math.floor(minutesPerKm);
  const s = Math.round((minutesPerKm - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDateTime(value: Date | string, timeZone: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(d);
}
